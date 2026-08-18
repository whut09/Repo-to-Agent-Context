using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("OpenCode++ Windows Installer")]
[assembly: AssemblyProduct("OpenCode++")]
[assembly: AssemblyVersion("__PACKAGE_VERSION__.0")]
[assembly: AssemblyFileVersion("__PACKAGE_VERSION__.0")]

internal static class OpenCodePlusPlusInstaller
{
    private const string PackageVersion = "__PACKAGE_VERSION__";
    private const string PluginResource = "OpenCodePlusPlus.Plugin.gz";
    private const string NativeCommandPatchResource = "OpenCodePlusPlus.NativeCommandPatch.js";
    private const string PluginFileName = "opencode-plusplus.js";
    private const string NativeCommandPatchMarker = "OPENCODE_PLUSPLUS_NATIVE_COMMANDS";
    private static readonly JavaScriptSerializer Json = CreateJsonSerializer();

    private static JavaScriptSerializer CreateJsonSerializer()
    {
        JavaScriptSerializer serializer = new JavaScriptSerializer();
        serializer.MaxJsonLength = Int32.MaxValue;
        return serializer;
    }

    [STAThread]
    public static int Main(string[] args)
    {
        bool machineOutput = HasArgument(args, "--json") || HasArgument(args, "--silent");
        try
        {
            bool skipHostPatch = HasArgument(args, "--skip-host-patch");
            InstallPaths paths = ResolvePaths(ArgumentValue(args, "--config-dir"), skipHostPatch);
            InstallReport report;
            if (HasArgument(args, "--uninstall")) report = Uninstall(paths, skipHostPatch);
            else if (HasArgument(args, "--status")) report = MakeReport("status", paths, "OpenCode++ installation status.");
            else if (HasArgument(args, "--enable")) report = SetEnabled(paths, true);
            else if (HasArgument(args, "--disable")) report = SetEnabled(paths, false);
            else report = Install(paths, HasArgument(args, "--skip-host-patch"));

            if (machineOutput) Console.WriteLine(Json.Serialize(report));
            else
            {
                Console.WriteLine(report.message);
                Console.WriteLine("Config: " + report.paths.configDir);
                Console.WriteLine("Plugin: " + (report.pluginExists ? "installed" : "not installed"));
                Console.WriteLine("Enabled: " + (report.enabled ? "yes" : "no"));
                if (report.action == "installed")
                {
                    MessageBox.Show(
                        report.message + Environment.NewLine + Environment.NewLine + "Restart OpenCode Desktop to load the plugin.",
                        "OpenCode++",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                }
            }
            return report.ok ? 0 : 1;
        }
        catch (Exception error)
        {
            if (machineOutput) Console.Error.WriteLine(Json.Serialize(new ErrorReport { ok = false, error = error.Message }));
            else
            {
                Console.Error.WriteLine(error);
                MessageBox.Show(error.Message, "OpenCode++ installation failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            return 1;
        }
    }

    private static InstallReport Install(InstallPaths paths, bool skipHostPatch)
    {
        if (!skipHostPatch) PatchOpenCodeHost(paths);
        byte[] plugin = ReadPlugin();
        AtomicWrite(paths.pluginFile, plugin);
        string[] commands = NativeCommandFiles();
        for (int index = 0; index < paths.commandFiles.Length; index++) AtomicWrite(paths.commandFiles[index], Encoding.UTF8.GetBytes(commands[index]));

        PluginState current = ReadState(paths.stateFile, true);
        DateTime now = DateTime.UtcNow;
        PluginState next = new PluginState
        {
            schemaVersion = 1,
            revision = current.revision + 1,
            enabled = current.enabled,
            version = PackageVersion,
            installedAt = String.IsNullOrEmpty(current.installedAt) ? Iso(now) : current.installedAt,
            updatedAt = Iso(now)
        };
        AtomicWriteJson(paths.stateFile, next);
        AtomicWriteJson(paths.manifestFile, new InstallationManifest
        {
            schemaVersion = 1,
            revision = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            version = PackageVersion,
            installedAt = Iso(now),
            plugin = PluginFileName,
            commands = new[]
            {
                Path.GetFileName(paths.commandFiles[0]),
                Path.GetFileName(paths.commandFiles[1]),
                Path.GetFileName(paths.commandFiles[2])
            }
        });
        return MakeReport("installed", paths, "OpenCode++ was installed with native Desktop commands for the current Windows user.");
    }

    private static InstallReport Uninstall(InstallPaths paths, bool skipHostPatch)
    {
        if (!skipHostPatch) RestoreOpenCodeHost(paths);
        DeleteOwnedFile(paths.pluginFile);
        DeleteOwnedFile(paths.manifestFile);
        DeleteOwnedFile(paths.stateFile);
        foreach (string commandFile in paths.commandFiles) DeleteOwnedFile(commandFile);
        RemoveEmptyDirectory(Path.GetDirectoryName(paths.manifestFile));
        return MakeReport("uninstalled", paths, "OpenCode++ was removed from the current Windows user.");
    }

    private static InstallReport SetEnabled(InstallPaths paths, bool enabled)
    {
        PluginState current = ReadState(paths.stateFile, true);
        DateTime now = DateTime.UtcNow;
        AtomicWriteJson(paths.stateFile, new PluginState
        {
            schemaVersion = 1,
            revision = current.revision + 1,
            enabled = enabled,
            version = PackageVersion,
            installedAt = String.IsNullOrEmpty(current.installedAt) ? Iso(now) : current.installedAt,
            updatedAt = Iso(now)
        });
        return MakeReport(enabled ? "enabled" : "disabled", paths, "OpenCode++ is now " + (enabled ? "enabled." : "disabled."));
    }

    private static InstallReport MakeReport(string action, InstallPaths paths, string message)
    {
        PluginState state = ReadState(paths.stateFile, false);
        int commandsInstalled = 0;
        foreach (string commandFile in paths.commandFiles) if (File.Exists(commandFile)) commandsInstalled++;
        bool pluginExists = File.Exists(paths.pluginFile);
        return new InstallReport
        {
            action = action,
            ok = action == "uninstalled" || pluginExists,
            version = PackageVersion,
            paths = paths,
            pluginExists = pluginExists,
            enabled = state.enabled,
            commandsInstalled = commandsInstalled,
            nativeCommandPatch = HostPatchPresent(paths),
            message = message
        };
    }

    private static InstallPaths ResolvePaths(string configuredDirectory, bool skipHostPatch)
    {
        string root = configuredDirectory;
        if (String.IsNullOrWhiteSpace(root)) root = Environment.GetEnvironmentVariable("OPENCODE_CONFIG_DIR");
        if (String.IsNullOrWhiteSpace(root))
        {
            string xdg = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME");
            root = String.IsNullOrWhiteSpace(xdg)
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config", "opencode")
                : Path.Combine(xdg, "opencode");
        }
        root = Path.GetFullPath(root);
        string hostAsar = skipHostPatch ? null : FindOpenCodeAsar();
        return new InstallPaths
        {
            configDir = root,
            hostAsar = hostAsar,
            hostBackup = hostAsar == null ? null : hostAsar + ".opencode-plusplus.original",
            pluginFile = Path.Combine(root, "plugins", PluginFileName),
            stateFile = Path.Combine(root, "opencode-plusplus", "state.json"),
            manifestFile = Path.Combine(root, "opencode-plusplus", "installation.json"),
            commandFiles = new[]
            {
                Path.Combine(root, "commands", "opencode-plusplus-on.md"),
                Path.Combine(root, "commands", "opencode-plusplus-off.md"),
                Path.Combine(root, "commands", "opencode-plusplus-status.md")
            }
        };
    }

    private static string[] NativeCommandFiles()
    {
        return new[]
        {
            "---\ndescription: OpenCode++ enable (local, no model)\n---\n\nEnable OpenCode++ locally.\n",
            "---\ndescription: OpenCode++ disable (local, no model)\n---\n\nDisable OpenCode++ locally.\n",
            "---\ndescription: OpenCode++ status (local, no model)\n---\n\nShow OpenCode++ local status.\n"
        };
    }

    private static string FindOpenCodeAsar()
    {
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string[] candidates =
        {
            Path.Combine(local, "Programs", "@opencode-aidesktop", "resources", "app.asar"),
            Path.Combine(local, "Programs", "OpenCode", "resources", "app.asar")
        };
        foreach (string candidate in candidates) if (File.Exists(candidate)) return candidate;
        try
        {
            foreach (Process process in Process.GetProcessesByName("OpenCode"))
            {
                try
                {
                    string executable = process.MainModule.FileName;
                    string candidate = Path.Combine(Path.GetDirectoryName(executable), "resources", "app.asar");
                    if (File.Exists(candidate)) return candidate;
                }
                catch
                {
                }
                finally
                {
                    process.Dispose();
                }
            }
        }
        catch
        {
        }
        throw new InvalidOperationException("OpenCode Desktop app.asar was not found. Install OpenCode Desktop first, or use --skip-host-patch for an isolated test install.");
    }

    private static byte[] ReadPlugin()
    {
        Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream(PluginResource);
        if (resource == null) throw new InvalidOperationException("Embedded OpenCode++ plugin is missing.");
        using (resource)
        using (GZipStream gzip = new GZipStream(resource, CompressionMode.Decompress))
        using (MemoryStream output = new MemoryStream())
        {
            gzip.CopyTo(output);
            byte[] plugin = output.ToArray();
            if (plugin.Length == 0) throw new InvalidOperationException("Embedded OpenCode++ plugin is empty.");
            return plugin;
        }
    }

    private static string ReadNativeCommandPatch()
    {
        Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream(NativeCommandPatchResource);
        if (resource == null) throw new InvalidOperationException("Embedded native command patch is missing.");
        using (resource)
        using (StreamReader reader = new StreamReader(resource, Encoding.UTF8))
        {
            string patch = reader.ReadToEnd();
            if (!patch.Contains(NativeCommandPatchMarker)) throw new InvalidOperationException("Embedded native command patch is invalid.");
            return patch;
        }
    }

    private static void PatchOpenCodeHost(InstallPaths paths)
    {
        if (String.IsNullOrEmpty(paths.hostAsar)) throw new InvalidOperationException("OpenCode Desktop app.asar was not found.");
        if (HostPatchPresent(paths)) return;
        if (OpenCodeRunning()) throw new InvalidOperationException("Close OpenCode Desktop completely before installing the OpenCode++ native command patch.");

        AsarArchive archive = ReadAsar(paths.hostAsar);
        AsarTarget target = FindNativeCommandTarget(archive);
        if (target == null) throw new InvalidOperationException("This OpenCode Desktop version is unsupported: SessionPrompt.command was not found in app.asar.");
        string patch = ReadNativeCommandPatch();
        string commandMarker = "const command = exports_Effect.fn(\"SessionPrompt.command\")(function* (input) {";
        if (target.text.Contains(NativeCommandPatchMarker)) return;
        int marker = target.text.IndexOf(commandMarker, StringComparison.Ordinal);
        if (marker < 0) throw new InvalidOperationException("This OpenCode Desktop version is unsupported: native command insertion point was not found.");
        string nativeBranch = "\n    if (OPENCODE_PLUSPLUS_NATIVE_COMMANDS.has(input.command)) {\n" +
            "      const nativeOutput = opencodePlusPlusNativeControl(input.command);\n" +
            "      const nativeModel = yield* currentModel(input.sessionID);\n" +
            "      const nativeUser = yield* createUserMessage({ sessionID: input.sessionID, messageID: input.messageID, agent: input.agent, model: nativeModel, variant: input.variant, parts: [{ type: \"text\", text: `/${input.command} ${input.arguments}`.trim() }] });\n" +
            "      const nativeContext = yield* exports_instance_state.context;\n" +
            "      const nativeNow = Date.now();\n" +
            "      const nativeAssistant = yield* sessions.updateMessage({ id: MessageID2.ascending(), role: \"assistant\", parentID: nativeUser.info.id, sessionID: input.sessionID, mode: nativeUser.info.agent, agent: nativeUser.info.agent, variant: nativeUser.info.model.variant, path: { cwd: nativeContext.directory, root: nativeContext.worktree }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, modelID: nativeModel.modelID, providerID: nativeModel.providerID, time: { created: nativeNow, completed: nativeNow }, finish: \"stop\" });\n" +
            "      yield* sessions.updatePart({ id: PartID2.ascending(), messageID: nativeAssistant.id, sessionID: input.sessionID, type: \"text\", text: nativeOutput, synthetic: true });\n" +
            "      yield* sessions.touch(input.sessionID);\n" +
            "      yield* status3.set(input.sessionID, { type: \"idle\" });\n" +
            "      return nativeUser;\n" +
            "    }";
        target.patched = target.text.Insert(marker + commandMarker.Length, nativeBranch);
        target.patched = target.patched.Insert(marker, patch + "\n");
        byte[] patchedTarget = Encoding.UTF8.GetBytes(target.patched);
        long sizeDelta = patchedTarget.LongLength - target.originalSize;
        ShiftOffsets(archive.files, target.originalOffset, sizeDelta, target.entry);
        target.entry["size"] = patchedTarget.LongLength;
        target.entry.Remove("integrity");

        string temporaryPath = paths.hostAsar + ".tmp-opencode-plusplus-" + Process.GetCurrentProcess().Id + "-" + Guid.NewGuid().ToString("N");
        try
        {
            WritePatchedAsar(archive, temporaryPath, target, patchedTarget);
            File.Copy(paths.hostAsar, paths.hostBackup, true);
            ReplaceFile(temporaryPath, paths.hostAsar);
        }
        finally
        {
            DeleteOwnedFile(temporaryPath);
        }
    }

    private static void RestoreOpenCodeHost(InstallPaths paths)
    {
        if (!File.Exists(paths.hostBackup) || String.IsNullOrEmpty(paths.hostAsar)) return;
        if (!HostPatchPresent(paths))
        {
            DeleteOwnedFile(paths.hostBackup);
            return;
        }
        if (OpenCodeRunning()) throw new InvalidOperationException("Close OpenCode Desktop completely before uninstalling the OpenCode++ native command patch.");
        string temporaryPath = paths.hostAsar + ".tmp-opencode-plusplus-restore-" + Process.GetCurrentProcess().Id + "-" + Guid.NewGuid().ToString("N");
        try
        {
            File.Copy(paths.hostBackup, temporaryPath, true);
            ReplaceFile(temporaryPath, paths.hostAsar);
            DeleteOwnedFile(paths.hostBackup);
        }
        finally
        {
            DeleteOwnedFile(temporaryPath);
        }
    }

    private static bool HostPatchPresent(InstallPaths paths)
    {
        if (String.IsNullOrEmpty(paths.hostAsar) || !File.Exists(paths.hostAsar)) return false;
        try
        {
            AsarArchive archive = ReadAsar(paths.hostAsar);
            return FindNativeCommandTarget(archive, NativeCommandPatchMarker) != null;
        }
        catch
        {
            return false;
        }
    }

    private static bool OpenCodeRunning()
    {
        try
        {
            return Process.GetProcessesByName("OpenCode").Length > 0;
        }
        catch
        {
            return false;
        }
    }

    private static AsarTarget FindNativeCommandTarget(AsarArchive archive)
    {
        string commandMarker = "const command = exports_Effect.fn(\"SessionPrompt.command\")(function* (input) {";
        return FindNativeCommandTarget(archive, commandMarker);
    }

    private static AsarTarget FindNativeCommandTarget(AsarArchive archive, string marker)
    {
        return FindNativeCommandTarget(archive.files, "", archive, marker);
    }

    private static AsarTarget FindNativeCommandTarget(Dictionary<string, object> files, string prefix, AsarArchive archive, string marker)
    {
        foreach (KeyValuePair<string, object> item in files)
        {
            Dictionary<string, object> entry = item.Value as Dictionary<string, object>;
            if (entry == null) continue;
            string path = prefix + "/" + item.Key;
            object nested;
            if (entry.TryGetValue("files", out nested))
            {
                AsarTarget result = FindNativeCommandTarget((Dictionary<string, object>)nested, path, archive, marker);
                if (result != null) return result;
                continue;
            }
            if (!path.EndsWith(".js", StringComparison.OrdinalIgnoreCase) || !entry.ContainsKey("offset")) continue;
            long offset = Convert.ToInt64(entry["offset"]);
            int size = Convert.ToInt32(entry["size"]);
            byte[] content = ReadSegment(archive.path, archive.dataStart + offset, size);
            string text = Encoding.UTF8.GetString(content);
            if (text.Contains(marker))
                return new AsarTarget { entry = entry, text = text, originalOffset = offset, originalSize = size };
        }
        return null;
    }

    private static void ShiftOffsets(Dictionary<string, object> files, long replacedOffset, long sizeDelta, Dictionary<string, object> replacedEntry)
    {
        if (sizeDelta == 0) return;
        foreach (KeyValuePair<string, object> item in files)
        {
            Dictionary<string, object> entry = item.Value as Dictionary<string, object>;
            if (entry == null) continue;
            object nested;
            if (entry.TryGetValue("files", out nested))
            {
                ShiftOffsets((Dictionary<string, object>)nested, replacedOffset, sizeDelta, replacedEntry);
                continue;
            }
            if (Object.ReferenceEquals(entry, replacedEntry) || !entry.ContainsKey("offset")) continue;
            long offset = Convert.ToInt64(entry["offset"]);
            if (offset > replacedOffset)
                entry["offset"] = (offset + sizeDelta).ToString(System.Globalization.CultureInfo.InvariantCulture);
        }
    }

    private static AsarArchive ReadAsar(string path)
    {
        using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
        using (BinaryReader reader = new BinaryReader(stream))
        {
            uint outerPayload = reader.ReadUInt32();
            if (outerPayload != 4) throw new InvalidOperationException("Unsupported app.asar header.");
            int headerSize = checked((int)reader.ReadUInt32());
            byte[] headerBuffer = reader.ReadBytes(headerSize);
            if (headerBuffer.Length != headerSize) throw new InvalidOperationException("app.asar header is truncated.");
            int jsonSize = BitConverter.ToInt32(headerBuffer, 4);
            string json = Encoding.UTF8.GetString(headerBuffer, 8, jsonSize);
            Dictionary<string, object> root = Json.DeserializeObject(json) as Dictionary<string, object>;
            if (root == null || !(root["files"] is Dictionary<string, object>)) throw new InvalidOperationException("app.asar header is invalid.");
            return new AsarArchive
            {
                path = path,
                files = (Dictionary<string, object>)root["files"],
                root = root,
                headerSize = headerSize,
                dataStart = 8L + headerSize,
                dataLength = stream.Length - (8L + headerSize)
            };
        }
    }

    private static byte[] ReadSegment(string path, long offset, int size)
    {
        byte[] content = new byte[size];
        using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            stream.Seek(offset, SeekOrigin.Begin);
            int read = 0;
            while (read < size)
            {
                int next = stream.Read(content, read, size - read);
                if (next <= 0) throw new InvalidOperationException("app.asar file data is truncated.");
                read += next;
            }
        }
        return content;
    }

    private static void WritePatchedAsar(AsarArchive archive, string destination, AsarTarget target, byte[] patchedTarget)
    {
        string json = Json.Serialize(archive.root);
        byte[] jsonBytes = Encoding.UTF8.GetBytes(json);
        int jsonPayload = Align4(4 + jsonBytes.Length);
        int headerSize = 4 + jsonPayload;
        byte[] header = new byte[headerSize];
        Buffer.BlockCopy(BitConverter.GetBytes(jsonPayload), 0, header, 0, 4);
        Buffer.BlockCopy(BitConverter.GetBytes(jsonBytes.Length), 0, header, 4, 4);
        Buffer.BlockCopy(jsonBytes, 0, header, 8, jsonBytes.Length);
        using (FileStream source = new FileStream(archive.path, FileMode.Open, FileAccess.Read, FileShare.Read))
        using (FileStream output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        using (BinaryWriter writer = new BinaryWriter(output))
        {
            writer.Write(4);
            writer.Write(header.Length);
            writer.Write(header);
            source.Seek(archive.dataStart, SeekOrigin.Begin);
            CopyBytes(source, output, target.originalOffset);
            output.Write(patchedTarget, 0, patchedTarget.Length);
            source.Seek(target.originalSize, SeekOrigin.Current);
            CopyBytes(source, output, archive.dataLength - target.originalOffset - target.originalSize);
            output.Flush(true);
        }
    }

    private static void CopyBytes(Stream source, Stream destination, long length)
    {
        byte[] buffer = new byte[1024 * 1024];
        while (length > 0)
        {
            int requested = (int)Math.Min(buffer.Length, length);
            int read = source.Read(buffer, 0, requested);
            if (read <= 0) throw new InvalidOperationException("app.asar data is truncated.");
            destination.Write(buffer, 0, read);
            length -= read;
        }
    }

    private static void ReplaceFile(string temporaryPath, string destinationPath)
    {
        try
        {
            File.Replace(temporaryPath, destinationPath, null, true);
        }
        catch (PlatformNotSupportedException)
        {
            File.Delete(destinationPath);
            File.Move(temporaryPath, destinationPath);
        }
    }

    private static int Align4(int value)
    {
        return (value + 3) / 4 * 4;
    }

    private static PluginState ReadState(string filePath, bool failOnCorrupt)
    {
        if (!File.Exists(filePath)) return new PluginState { enabled = true };
        try
        {
            Dictionary<string, object> value = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(filePath, Encoding.UTF8));
            return new PluginState
            {
                schemaVersion = IntValue(value, "schemaVersion"),
                revision = IntValue(value, "revision"),
                enabled = !value.ContainsKey("enabled") || BooleanValue(value["enabled"]),
                version = StringValue(value, "version"),
                installedAt = StringValue(value, "installedAt"),
                updatedAt = StringValue(value, "updatedAt")
            };
        }
        catch (Exception error)
        {
            if (failOnCorrupt) throw new InvalidOperationException("Cannot update corrupt state file " + filePath + ": " + error.Message, error);
            return new PluginState { enabled = true };
        }
    }

    private static void AtomicWriteJson(string filePath, object value)
    {
        AtomicWrite(filePath, new UTF8Encoding(false).GetBytes(Json.Serialize(value) + Environment.NewLine));
    }

    private static void AtomicWrite(string filePath, byte[] content)
    {
        string directory = Path.GetDirectoryName(filePath);
        Directory.CreateDirectory(directory);
        string temporaryPath = filePath + ".tmp-" + Process.GetCurrentProcess().Id + "-" + Guid.NewGuid().ToString("N");
        string backupPath = filePath + ".bak-" + Process.GetCurrentProcess().Id + "-" + Guid.NewGuid().ToString("N");
        try
        {
            using (FileStream stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, FileOptions.WriteThrough))
            {
                stream.Write(content, 0, content.Length);
                stream.Flush(true);
            }
            if (File.Exists(filePath))
            {
                File.Replace(temporaryPath, filePath, backupPath, true);
                DeleteOwnedFile(backupPath);
            }
            else File.Move(temporaryPath, filePath);
        }
        finally
        {
            DeleteOwnedFile(temporaryPath);
        }
    }

    private static void DeleteOwnedFile(string filePath)
    {
        if (File.Exists(filePath)) File.Delete(filePath);
    }

    private static void RemoveEmptyDirectory(string directory)
    {
        if (!String.IsNullOrEmpty(directory) && Directory.Exists(directory) && Directory.GetFileSystemEntries(directory).Length == 0)
            Directory.Delete(directory, false);
    }

    private static bool HasArgument(string[] args, string name)
    {
        foreach (string value in args) if (String.Equals(value, name, StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }

    private static string ArgumentValue(string[] args, string name)
    {
        for (int index = 0; index < args.Length - 1; index++)
            if (String.Equals(args[index], name, StringComparison.OrdinalIgnoreCase)) return args[index + 1];
        return null;
    }

    private static int IntValue(Dictionary<string, object> value, string key)
    {
        object raw;
        if (!value.TryGetValue(key, out raw) || raw == null) return 0;
        return Convert.ToInt32(raw);
    }

    private static bool BooleanValue(object value)
    {
        return value is bool ? (bool)value : Convert.ToBoolean(value);
    }

    private static string StringValue(Dictionary<string, object> value, string key)
    {
        object raw;
        return value.TryGetValue(key, out raw) && raw != null ? Convert.ToString(raw) : null;
    }

    private static string Iso(DateTime value)
    {
        return value.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");
    }

    private sealed class ErrorReport
    {
        public bool ok;
        public string error;
    }

    private sealed class PluginState
    {
        public int schemaVersion;
        public int revision;
        public bool enabled = true;
        public string version;
        public string installedAt;
        public string updatedAt;
    }

    private sealed class InstallationManifest
    {
        public int schemaVersion;
        public long revision;
        public string version;
        public string installedAt;
        public string plugin;
        public string[] commands;
    }

    private sealed class InstallPaths
    {
        public string configDir;
        public string hostAsar;
        public string hostBackup;
        public string pluginFile;
        public string stateFile;
        public string manifestFile;
        public string[] commandFiles;
    }

    private sealed class InstallReport
    {
        public string action;
        public bool ok;
        public string version;
        public InstallPaths paths;
        public bool pluginExists;
        public bool enabled;
        public int commandsInstalled;
        public bool nativeCommandPatch;
        public string message;
    }

    private sealed class AsarArchive
    {
        public string path;
        public Dictionary<string, object> root;
        public Dictionary<string, object> files;
        public int headerSize;
        public long dataStart;
        public long dataLength;
    }

    private sealed class AsarTarget
    {
        public Dictionary<string, object> entry;
        public string text;
        public string patched;
        public long originalOffset;
        public long originalSize;
    }
}
