using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace BolsaMonitor.Desktop.Interop;

/// <summary>
/// Ativa a barra de título escura do Windows 10/11.
///
/// Sem isso, uma janela de fundo escuro fica com a barra branca do sistema — o
/// contraste quebra a identidade visual. Em versões sem suporte, o atributo é
/// simplesmente ignorado.
/// </summary>
internal static class DarkTitleBar
{
    private const int DwmwaUseImmersiveDarkMode = 20;
    private const int DwmwaUseImmersiveDarkModeLegacy = 19;

    public static void Apply(Window window)
    {
        var handle = new WindowInteropHelper(window).Handle;

        if (handle == IntPtr.Zero)
        {
            // Handle ainda não criado: aplica quando a janela for carregada.
            window.SourceInitialized += (_, _) => ApplyToHandle(new WindowInteropHelper(window).Handle);

            return;
        }

        ApplyToHandle(handle);
    }

    private static void ApplyToHandle(IntPtr handle)
    {
        if (handle == IntPtr.Zero)
        {
            return;
        }

        var enabled = 1;

        if (DwmSetWindowAttribute(handle, DwmwaUseImmersiveDarkMode, ref enabled, sizeof(int)) != 0)
        {
            DwmSetWindowAttribute(handle, DwmwaUseImmersiveDarkModeLegacy, ref enabled, sizeof(int));
        }
    }

    [DllImport("dwmapi.dll", SetLastError = true)]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
}
