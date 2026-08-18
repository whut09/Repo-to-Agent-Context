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
    private const string PluginFileName = "opencode-plusplus.js";
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

    [STAThread]
    public static int Main(string[] args)
    {
        bool machineOutput = HasArgument(args, "--json") || HasArgument(args, "--silent");
        try
        {
            InstallPaths paths = ResolvePaths(ArgumentValue(args, "--config-dir"));
            InstallReport report;
            if (HasArgument(args, "--uninstall")) report = Uninstall(paths);
            else if (HasArgument(args, "--status")) report = MakeReport("status", paths, "OpenCode++ installation status.");
            else if (HasArgument(args, "--enable")) report = SetEnabled(paths, true);
            else if (HasArgument(args, "--disable")) report = SetEnabled(paths, false);
            else report = Install(paths);

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

    private static InstallReport Install(InstallPaths paths)
    {
        byte[] plugin = ReadPlugin();
        AtomicWrite(paths.pluginFile, plugin);
        foreach (string commandFile in paths.commandFiles) DeleteOwnedFile(commandFile);

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
            commands = new string[0]
        });
        return MakeReport("installed", paths, "OpenCode++ was installed for the current Windows user.");
    }

    private static InstallReport Uninstall(InstallPaths paths)
    {
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
            message = message
        };
    }

    private static InstallPaths ResolvePaths(string configuredDirectory)
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
        return new InstallPaths
        {
            configDir = root,
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
        public string message;
    }
}
