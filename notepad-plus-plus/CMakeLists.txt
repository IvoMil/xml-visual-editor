# ── Notepad++ Plugin (Windows Only) ────────────────────────────────────────
if(NOT WIN32)
    message(FATAL_ERROR "Notepad++ plugin can only be built on Windows")
endif()

add_library(xve-npp-plugin SHARED
    src/plugin_main.cpp
)

target_link_libraries(xve-npp-plugin
    PRIVATE
        xve-core
)

target_compile_definitions(xve-npp-plugin
    PRIVATE
        XVE_BUILD_DLL
)

# Output name without "lib" prefix
set_target_properties(xve-npp-plugin PROPERTIES
    PREFIX ""
    OUTPUT_NAME "XmlVisualEditor"
)
