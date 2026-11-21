using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BolsaMonitor.Core.Persistence;

/// <summary>Tokens de sessão do Supabase.</summary>
public sealed record StoredSession(string AccessToken, string RefreshToken);

/// <summary>
/// Guarda a sessão em disco cifrada com DPAPI no escopo do usuário do Windows.
///
/// Isso significa que outro usuário da máquina não consegue ler o arquivo, e que
/// copiá-lo para outro computador não serve de nada — a chave fica no perfil.
/// Nunca gravamos a senha.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class SessionStore
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("BolsaMonitor.Session.v1");

    private readonly string _filePath;

    public SessionStore(string? directory = null)
    {
        var baseDirectory = directory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "BolsaMonitor");

        Directory.CreateDirectory(baseDirectory);
        _filePath = Path.Combine(baseDirectory, "session.dat");
    }

    public string FilePath => _filePath;

    public StoredSession? Load()
    {
        if (!File.Exists(_filePath))
        {
            return null;
        }

        try
        {
            var encrypted = File.ReadAllBytes(_filePath);
            var plain = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser);
            var session = JsonSerializer.Deserialize<StoredSession>(plain);

            return session is not null && !string.IsNullOrWhiteSpace(session.RefreshToken) ? session : null;
        }
        catch (Exception exception) when (exception is CryptographicException or JsonException or IOException)
        {
            // Arquivo corrompido ou de outra máquina: descarta e pede login.
            Clear();

            return null;
        }
    }

    public void Save(StoredSession session)
    {
        var plain = JsonSerializer.SerializeToUtf8Bytes(session);
        var encrypted = ProtectedData.Protect(plain, Entropy, DataProtectionScope.CurrentUser);

        File.WriteAllBytes(_filePath, encrypted);
    }

    public void Clear()
    {
        try
        {
            if (File.Exists(_filePath))
            {
                File.Delete(_filePath);
            }
        }
        catch (IOException)
        {
            // Sem permissão de apagar: o próximo login sobrescreve o arquivo.
        }
    }
}
