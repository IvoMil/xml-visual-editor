#pragma once

// DLL export/import macros for shared library builds
#if defined(XVE_BUILD_DLL)
#if defined(_MSC_VER)
#define XVE_API __declspec(dllexport)
#else
#define XVE_API __attribute__((visibility("default")))
#endif
#elif defined(XVE_USE_DLL)
#if defined(_MSC_VER)
#define XVE_API __declspec(dllimport)
#else
#define XVE_API
#endif
#else
#define XVE_API
#endif
