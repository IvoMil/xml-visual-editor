// Notepad++ plugin entry point — placeholder
// Will implement NppPlugin interface when ready

#ifdef _WIN32
#include <windows.h>

BOOL APIENTRY DllMain(HMODULE hModule, DWORD reasonForCall, LPVOID lpReserved) {
    switch (reasonForCall) {
        case DLL_PROCESS_ATTACH:
        case DLL_PROCESS_DETACH:
            break;
    }
    return TRUE;
}
#endif
