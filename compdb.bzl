# Hacked by ramblehead - need to correct the following info...
#
# Copyright 2017 GRAIL, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Compilation database generation Bazel rules.

compilation_database will generate a compile_commands.json file for the
given targets. This approach uses the aspects feature of bazel.

An alternative approach is the one used by the kythe project using
(experimental) action listeners.
https://github.com/google/kythe/blob/master/tools/cpp/generate_compilation_database.sh
"""

load("@bazel_tools//tools/cpp:toolchain_utils.bzl", "find_cpp_toolchain")
load(
  "@bazel_tools//tools/build_defs/cc:action_names.bzl",
  "CPP_COMPILE_ACTION_NAME",
  "CPP_LINK_DYNAMIC_LIBRARY_ACTION_NAME",
  "C_COMPILE_ACTION_NAME",
)

CompilationAspect = provider()

_indentation = "  "
_module_exts_default = ["cpp", "cc", "cxx", "C"]
_exclude_dirs_default = []

def _compilation_db_json(compilation_db, module_exts, exclude_dirs):
  # for entry in compilation_db:
  #   print(entry.src.path)

  # Return a JSON string for the compilation db entries.
  # entries = [entry.db.to_json() for entry in compilation_db if entry.src.extension in module_exts]
  # entries = [entry.db.to_json() for entry in compilation_db
  #            if entry.src.extension in module_exts and entry.src.path not in exclude_dirs]

  if type(compilation_db) == "depset":
    compilation_db_list = compilation_db.to_list()
  else: compilation_db_list = compilation_db

  entries = []
  for entry in compilation_db_list:
    if entry.src.extension in module_exts:
      exclude = False
      for exclude_dir in exclude_dirs:
        if entry.src.path.startswith(exclude_dir):
          exclude = True
          break
      if not exclude:
        entries.append(entry.db.to_json())

  s = _indentation
  l = len(entries)
  if l >= 1:
    for i in range(len(entries) - 1): entries[i] = s + entries[i] + ",\n"
    entries[-1] = s + entries[-1]
  return "".join(entries)

def _is_cpp_target(srcs):
  for src in srcs:
    for extension in _module_exts_default:
      if src.extension == extension:
        return True
  return False

def _sources(target, ctx):
  srcs = []
  if "srcs" in dir(ctx.rule.attr):
    srcs += [f for src in ctx.rule.attr.srcs for f in src.files.to_list()]
  if "hdrs" in dir(ctx.rule.attr):
    srcs += [f for src in ctx.rule.attr.hdrs for f in src.files.to_list()]
  return srcs

def _compilation_database_aspect_impl(target, ctx):
  # Write the compile commands for this target to a file, and return
  # the commands for the transitive closure.

  # We support only these rule kinds.
  if ctx.rule.kind not in ["cc_library", "cc_binary", "cc_test",
                           "cc_inc_library", "cc_proto_library"]:
    return []

  compilation_db = []

  cc_toolchain = find_cpp_toolchain(ctx)
  feature_configuration = cc_common.configure_features(
    ctx = ctx,
    cc_toolchain = cc_toolchain,
    requested_features = ctx.features,
    unsupported_features = ctx.disabled_features)
  compile_variables = cc_common.create_compile_variables(
    feature_configuration = feature_configuration,
    cc_toolchain = cc_toolchain,
    user_compile_flags = ctx.fragments.cpp.copts)
  compiler_options = cc_common.get_memory_inefficient_command_line(
    feature_configuration = feature_configuration,
    action_name = C_COMPILE_ACTION_NAME,
    variables = compile_variables)
  compiler = str(cc_common.get_tool_for_action(
    feature_configuration = feature_configuration,
    action_name = C_COMPILE_ACTION_NAME))

  srcs = _sources(target, ctx)
  if not srcs:
    # This should not happen for any of our supported rule kinds.
    print("Rule with no sources: " + str(target.label))
    return []

  # This is useful for compiling .h headers as C++ code.
  force_cpp_mode_option = ""
  if _is_cpp_target(srcs):
    compile_variables = cc_common.create_compile_variables(
      feature_configuration = feature_configuration,
      cc_toolchain = cc_toolchain,
      user_compile_flags = ctx.fragments.cpp.cxxopts + ctx.fragments.cpp.copts,
      add_legacy_cxx_options = True)
    compiler_options = cc_common.get_memory_inefficient_command_line(
      feature_configuration = feature_configuration,
      action_name = CPP_COMPILE_ACTION_NAME,
      variables = compile_variables)
    force_cpp_mode_option = " -x c++"

  target_compile_flags = []
  target_compile_flags += \
    ['-D ' + i for i in target[CcInfo].compilation_context.defines.to_list()]
  target_compile_flags += \
    ['-I ' + i for i in target[CcInfo].compilation_context.includes.to_list()]
  target_compile_flags += \
    ['-iquote ' + i
     for i in target[CcInfo].compilation_context.quote_includes.to_list()]
  target_compile_flags += \
    ['-isystem ' + i
     for i in target[CcInfo].compilation_context.system_includes.to_list()]
  compile_flags = (
    compiler_options +
    target_compile_flags +
    (ctx.rule.attr.copts if "copts" in dir(ctx.rule.attr) else [])
  )
  # system built-in directories (helpful for macOS).
  if cc_toolchain.libc == "macosx":
    compile_flags += ["-isystem " + str(d)
                      for d in cc_toolchain.built_in_include_directories]

  compile_command = \
    compiler + " " + " ".join(compile_flags) + force_cpp_mode_option

  for src in srcs:
    command_for_file = compile_command + " -c " + src.path
    exec_root_marker = "__EXEC_ROOT__"
    compilation_db.append(struct(
      db = struct(
        directory = exec_root_marker,
        command = command_for_file,
        file = src.path),
      src = src))

  # Write the commands for this target.
  compdb_file = ctx.actions.declare_file(ctx.label.name + ".compile_commands.json")
  ctx.actions.write(
    content = _compilation_db_json(
      compilation_db, _module_exts_default, _exclude_dirs_default),
    output = compdb_file)

  # Collect all transitive dependencies.
  compilation_db = depset(compilation_db)
  all_compdb_files = depset([compdb_file])
  for dep in ctx.rule.attr.deps:
    if CompilationAspect not in dep: continue
    # compilation_db += dep[CompilationAspect].compilation_db
    # all_compdb_files += dep[OutputGroupInfo].compdb_files
    compilation_db = depset(
      transitive = [compilation_db, dep[CompilationAspect].compilation_db])
    all_compdb_files = depset(
      transitive = [all_compdb_files, dep[OutputGroupInfo].compdb_files])

  return [
    CompilationAspect(compilation_db = compilation_db),
    OutputGroupInfo(compdb_files = all_compdb_files),
  ]

compilation_database_aspect = aspect(
  attr_aspects = ["deps"],
  fragments = ["cpp"],
  required_aspect_providers = [CompilationAspect],
  implementation = _compilation_database_aspect_impl,
  attrs = {
    "_cc_toolchain": attr.label(
      default = Label("@bazel_tools//tools/cpp:current_cc_toolchain")),
  })

def _compilation_database_impl(ctx):
  # Generates a single compile_commands.json file with the
  # transitive depset of specified targets.

  module_exts = ctx.attr.module_exts
  exclude_dirs = ctx.attr.exclude_dirs

  compilation_db = depset()
  for target in ctx.attr.targets:
    # compilation_db += target[CompilationAspect].compilation_db
    compilation_db = depset(
      transitive = [compilation_db, target[CompilationAspect].compilation_db])

  db_json = _compilation_db_json(compilation_db, module_exts, exclude_dirs)
  content = "[\n" + db_json + "\n]\n"
  content = content.replace("__EXEC_ROOT__", ctx.var["exec_root"])
  ctx.actions.write(output=ctx.outputs.filename, content=content)

compilation_database = rule(
  attrs = {
    "targets": attr.label_list(
      aspects = [compilation_database_aspect],
      doc = "List of all cc targets which should be included."),
    "module_exts": attr.string_list(
      default = _module_exts_default,
      doc = "List of extensions of compile module files which " +
            "should be included into compillation database."),
    "exclude_dirs": attr.string_list(
      default = _exclude_dirs_default,
      doc = "List of direcrories to exclude from compillation database."),
  },
  outputs = {
    "filename": "compile_commands.json",
  },
  output_to_genfiles = True,
  implementation = _compilation_database_impl,
)
