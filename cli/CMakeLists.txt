# ── CLI Tools ───────────────────────────────────────────────────────────────
add_executable(xve-validate
    src/validate_main.cpp
)

target_link_libraries(xve-validate
    PRIVATE
        xve-core
)
