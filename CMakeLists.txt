cmake_minimum_required(VERSION 3.21)

project(
    xml-visual-editor
    VERSION 0.5.0
    DESCRIPTION "Multi-platform XML editing toolkit with XSD schema awareness"
    LANGUAGES CXX
)

# ── C++20 Standard ──────────────────────────────────────────────────────────
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ── Options ─────────────────────────────────────────────────────────────────
option(XVE_BUILD_TESTS "Build unit and integration tests" ON)
option(XVE_BUILD_BENCHMARKS "Build benchmarks" OFF)
option(XVE_BUILD_NPP_PLUGIN "Build Notepad++ plugin (Windows only)" OFF)
option(XVE_BUILD_CLI "Build CLI tools" ON)

# ── Dependencies (vcpkg) ───────────────────────────────────────────────────
find_package(pugixml CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)

if(XVE_BUILD_TESTS)
    find_package(Catch2 3 CONFIG REQUIRED)
    include(CTest)
    include(Catch)
endif()

if(XVE_BUILD_BENCHMARKS)
    find_package(benchmark CONFIG REQUIRED)
endif()

# ── Subdirectories ─────────────────────────────────────────────────────────
add_subdirectory(core)

if(XVE_BUILD_CLI)
    add_subdirectory(cli)
endif()

if(XVE_BUILD_NPP_PLUGIN AND WIN32)
    add_subdirectory(notepad-plus-plus)
endif()
