# ── Core Engine Static Library ──────────────────────────────────────────────
add_library(xve-core STATIC)

target_sources(xve-core
    PRIVATE
        src/version.cpp
        src/core/document.cpp
        src/jsonrpc/jsonrpc_types.cpp
        src/jsonrpc/jsonrpc_server.cpp
        src/jsonrpc/method_handlers.cpp
        src/jsonrpc/schema_handlers.cpp
        src/jsonrpc/grid_view_handlers.cpp
        src/jsonrpc/helper_handlers.cpp
        src/services/document_service.cpp
        src/services/file_service.cpp
        src/services/validation_service.cpp
        src/services/schema_service.cpp
        src/services/grid_view_service.cpp
        src/services/helper_data_service.cpp
        src/services/helper_data_service_insert.cpp
        src/services/helper_data_service_insert_element.cpp
        src/services/helper_data_service_tree.cpp
        src/services/service_container.cpp
        src/schema/schema_parser.cpp
        src/schema/schema_parser_compositor.cpp
        src/schema/schema_parser_types.cpp
        src/schema/schema_parser_queries.cpp
        src/schema/schema_validator.cpp
        src/schema/schema_validator_content.cpp
        src/schema/schema_validator_value.cpp
)

target_include_directories(xve-core
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
)

target_compile_features(xve-core PUBLIC cxx_std_23)

target_link_libraries(xve-core
    PUBLIC
        pugixml::pugixml
        nlohmann_json::nlohmann_json
)

# ── Engine Executable (JSON-RPC server for VS Code) ────────────────────────
add_executable(xve-engine
    src/engine_main.cpp
)

target_link_libraries(xve-engine
    PRIVATE
        xve-core
)

# ── Tests ───────────────────────────────────────────────────────────────────
if(XVE_BUILD_TESTS)
    add_executable(xve-tests
        tests/unit/test_placeholder.cpp
        tests/unit/test_document.cpp
        tests/unit/test_services.cpp
        tests/unit/test_schema_types.cpp
        tests/unit/test_schema_parser_basic_types.cpp
        tests/unit/test_schema_parser_group_refs.cpp
        tests/unit/test_schema_parser_annotations_wildcards.cpp
        tests/unit/test_schema_service.cpp
        tests/unit/test_schema_validator_basic.cpp
        tests/unit/test_schema_validator_choice_cardinality.cpp
        tests/unit/test_schema_validator_type_resolution.cpp
        tests/unit/test_schema_validator_maxoccurs_regressions.cpp
        tests/unit/test_schema_validator_unbounded_groups.cpp
        tests/unit/test_schema_validator_optional_choice_min_occurs.cpp
        tests/unit/test_schema_validator_complex_group_composition.cpp
        tests/unit/test_schema_validator_choice_satisfaction.cpp
        tests/unit/test_schema_validator_regression3.cpp
        tests/unit/test_schema_validator_regression4.cpp
        tests/unit/test_jsonrpc_types.cpp
        tests/unit/test_jsonrpc_server.cpp
        tests/unit/test_document_formatting.cpp
        tests/unit/test_helper_data_service_elements_panel.cpp
        tests/unit/test_helper_data_service_insert_required_children.cpp
        tests/unit/test_helper_data_insert.cpp
        tests/unit/test_helper_data_cardinality.cpp
        tests/unit/test_helper_data_tree.cpp
        tests/unit/test_element_expansion.cpp
        tests/unit/test_schema_wildcard.cpp
        tests/unit/test_grid_view_tree_build.cpp
        tests/unit/test_grid_view_comments.cpp
        tests/unit/test_grid_view_json_writer.cpp
        tests/unit/test_grid_view_hybrid_candidacy.cpp
        tests/unit/test_grid_view_b1_fixture.cpp
        tests/unit/test_grid_view_perf.cpp
    )

    target_link_libraries(xve-tests
        PRIVATE
            xve-core
            Catch2::Catch2WithMain
    )

    catch_discover_tests(xve-tests)

    # Phase B.4 diagnostic benchmark. Not a test; run manually.
    add_executable(xve-bench-grid tests/bench_grid_view_main.cpp)
    target_link_libraries(xve-bench-grid PRIVATE xve-core nlohmann_json::nlohmann_json)
endif()
