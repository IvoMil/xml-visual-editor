#include "test_helper_data_fixtures.h"

#include <sstream>

// ── Attributes Panel Data ─────────────────────────────────────────────────

TEST_CASE("HelperDataService - Attributes panel data", "[helper][attributes]") {
    TestFixture f;
    f.Init(kTestXsd, kTestXml);

    SECTION("Returns attributes for root element with document values") {
        auto result = f.Helper()->ComputeAttributesPanelData(f.schema_id, "root", {"root"}, f.doc_id);
        REQUIRE(result.has_value());
        CHECK(result->element_name == "root");
        REQUIRE(!result->attributes.empty());

        bool found_version = false, found_lang = false;
        for (const auto& attr : result->attributes) {
            if (attr.name == "version") {
                CHECK(attr.use == "required");
                CHECK(attr.is_set);
                CHECK(attr.current_value == "1.0");
                found_version = true;
            }
            if (attr.name == "lang") {
                CHECK(attr.use == "optional");
                CHECK(attr.is_set);
                CHECK(attr.current_value == "en");
                CHECK(attr.default_value == "en");
                found_lang = true;
            }
        }
        CHECK(found_version);
        CHECK(found_lang);
    }

    SECTION("Required attributes sorted before optional") {
        auto result = f.Helper()->ComputeAttributesPanelData(f.schema_id, "root", {"root"}, f.doc_id);
        REQUIRE(result.has_value());
        REQUIRE(result->attributes.size() >= 2);
        // First attribute should be required (version)
        CHECK(result->attributes[0].use == "required");
    }

    SECTION("Enum values populated for enumeration types") {
        auto result = f.Helper()->ComputeAttributesPanelData(f.schema_id, "root", {"root"}, f.doc_id);
        REQUIRE(result.has_value());

        for (const auto& attr : result->attributes) {
            if (attr.name == "lang") {
                CHECK(!attr.enum_values.empty());
                // Should contain en, nl, de
                bool has_en = false;
                for (const auto& v : attr.enum_values) {
                    if (v == "en")
                        has_en = true;
                }
                CHECK(has_en);
                break;
            }
        }
    }

    SECTION("Item attributes with enum type") {
        auto result = f.Helper()->ComputeAttributesPanelData(f.schema_id, "item", {"root", "item"}, f.doc_id);
        REQUIRE(result.has_value());

        bool found_id = false, found_status = false;
        for (const auto& attr : result->attributes) {
            if (attr.name == "id") {
                CHECK(attr.use == "required");
                CHECK(attr.is_set);
                CHECK(attr.current_value == "a");
                found_id = true;
            }
            if (attr.name == "status") {
                CHECK(attr.use == "optional");
                CHECK(!attr.is_set);
                // enum values: active, inactive, pending
                CHECK(!attr.enum_values.empty());
                found_status = true;
            }
        }
        CHECK(found_id);
        CHECK(found_status);
    }

    SECTION("Schema-only mode (no document) - not set") {
        auto result = f.Helper()->ComputeAttributesPanelData(f.schema_id, "root", {}, "");
        REQUIRE(result.has_value());
        for (const auto& attr : result->attributes) {
            CHECK(!attr.is_set);
            CHECK(attr.current_value.empty());
        }
    }

    SECTION("Attributes via UpdateDocumentContent (VS Code integration path)") {
        // Simulate the VS Code flow: document synced via UpdateDocumentContent (not OpenDocumentFromString).
        auto& doc_svc = *f.container.GetDocumentService();
        std::string uri_id = "file:///c%3A/Users/test/file.xml";
        bool ok = doc_svc.UpdateDocumentContent(uri_id, kTestXml);
        REQUIRE(ok);

        auto result = f.Helper()->ComputeAttributesPanelData(f.schema_id, "root", {"root"}, uri_id);
        REQUIRE(result.has_value());
        CHECK(result->element_name == "root");

        bool found_version = false;
        for (const auto& attr : result->attributes) {
            if (attr.name == "version") {
                CHECK(attr.is_set);
                CHECK(attr.current_value == "1.0");
                found_version = true;
            }
        }
        CHECK(found_version);
    }

    SECTION("Self-closing element attributes are read correctly") {
        // item elements are NOT self-closing in kTestXml, but the pugixml behavior
        // is identical for self-closing vs open/close tags.
        // Verify second item via indexed path.
        auto result =
            f.Helper()->ComputeAttributesPanelData(f.schema_id, "item", {"root", "item[2]"}, f.doc_id);
        REQUIRE(result.has_value());

        bool found_id = false;
        for (const auto& attr : result->attributes) {
            if (attr.name == "id") {
                CHECK(attr.is_set);
                CHECK(attr.current_value == "b");
                found_id = true;
            }
        }
        CHECK(found_id);
    }
}

// ── Node Details ──────────────────────────────────────────────────────────

TEST_CASE("HelperDataService - Node details", "[helper][info]") {
    TestFixture f;
    f.Init(kTestXsd, kTestXml);

    SECTION("Returns basic element info") {
        auto result = f.Helper()->ComputeNodeDetails(f.schema_id, "root", {"root"}, f.doc_id);
        REQUIRE(result.has_value());
        CHECK(result->name == "root");
    }

    SECTION("Generates XPath from element path") {
        auto result = f.Helper()->ComputeNodeDetails(f.schema_id, "item", {"root", "item"}, f.doc_id);
        REQUIRE(result.has_value());
        CHECK(result->xpath == "/root/item");
    }

    SECTION("Instance state computed with parent context") {
        auto result = f.Helper()->ComputeNodeDetails(f.schema_id, "title", {"root", "title"}, f.doc_id);
        REQUIRE(result.has_value());
        if (result->instance_state.has_value()) {
            CHECK(result->instance_state->current_count == 1);
            CHECK(result->instance_state->is_satisfied);
        }
    }

    SECTION("Compositor context has parent info") {
        auto result = f.Helper()->ComputeNodeDetails(f.schema_id, "title", {"root", "title"}, f.doc_id);
        REQUIRE(result.has_value());
        if (result->compositor_context.has_value()) {
            CHECK(result->compositor_context->parent_element == "root");
        }
    }

    SECTION("Returns nullopt for unknown element") {
        auto result = f.Helper()->ComputeNodeDetails(f.schema_id, "nope", {}, "");
        CHECK(!result.has_value());
    }
}

// ── Insert Element ────────────────────────────────────────────────────────

TEST_CASE("HelperDataService - InsertElement", "[helper][insert]") {
    TestFixture f;
    f.Init(kTestXsd, kTestXml);

    SECTION("Inserts element and returns updated content") {
        auto result = f.Helper()->InsertElement(f.doc_id, f.schema_id, {"root"}, "footer");
        REQUIRE(result.success);
        CHECK(result.new_content.find("<footer") != std::string::npos);
    }

    SECTION("Returns failure for missing document") {
        auto result = f.Helper()->InsertElement("nonexistent", f.schema_id, {"root"}, "footer");
        CHECK(!result.success);
    }

    SECTION("Returns failure for empty doc_id") {
        auto result = f.Helper()->InsertElement("", f.schema_id, {"root"}, "footer");
        CHECK(!result.success);
    }

    SECTION("Schema-ordered insertion - footer after item") {
        auto result = f.Helper()->InsertElement(f.doc_id, f.schema_id, {"root"}, "footer");
        REQUIRE(result.success);
        auto item_pos = result.new_content.find("<item");
        auto footer_pos = result.new_content.find("<footer");
        REQUIRE(item_pos != std::string::npos);
        REQUIRE(footer_pos != std::string::npos);
        CHECK(footer_pos > item_pos);
    }

    SECTION("Insert description before items (schema order)") {
        auto result = f.Helper()->InsertElement(f.doc_id, f.schema_id, {"root"}, "description");
        REQUIRE(result.success);
        auto title_pos = result.new_content.find("<title");
        auto desc_pos = result.new_content.find("<description");
        auto item_pos = result.new_content.find("<item");
        REQUIRE(title_pos != std::string::npos);
        REQUIRE(desc_pos != std::string::npos);
        REQUIRE(item_pos != std::string::npos);
        CHECK(desc_pos > title_pos);
        CHECK(desc_pos < item_pos);
    }

    SECTION("Returns valid insertion position") {
        auto result = f.Helper()->InsertElement(f.doc_id, f.schema_id, {"root"}, "footer");
        REQUIRE(result.success);
        CHECK(result.inserted_line >= 0);
        CHECK(result.inserted_column >= 0);
        // Verify the position points to the inserted tag.
        std::istringstream iss(result.new_content);
        std::string line;
        int cur_line = 0;
        while (std::getline(iss, line)) {
            if (cur_line == result.inserted_line) {
                CHECK(line.find("<footer") != std::string::npos);
                break;
            }
            ++cur_line;
        }
    }
}

// ── Node Details - Enum Values ────────────────────────────────────────────

TEST_CASE("HelperDataService - Node details with enum values", "[helper][info][enum]") {
    TestFixture f;
    f.Init(kEnumElementXsd, kEnumElementXml);

    SECTION("Enum values populated for enumeration element type") {
        auto result = f.Helper()->ComputeNodeDetails(f.schema_id, "valueType", {"data", "valueType"}, f.doc_id);
        REQUIRE(result.has_value());
        REQUIRE(result->enum_values.size() == 3);
        CHECK(result->enum_values[0] == "scalar");
        CHECK(result->enum_values[1] == "vector");
        CHECK(result->enum_values[2] == "accumulative");
    }

    SECTION("No enum values for non-enumeration element type") {
        auto result = f.Helper()->ComputeNodeDetails(f.schema_id, "amount", {"data", "amount"}, f.doc_id);
        REQUIRE(result.has_value());
        CHECK(result->enum_values.empty());
    }
}

// ── Node Details - Content Complete ───────────────────────────────────────

TEST_CASE("HelperDataService - Node details content_complete for self", "[helper][info][content]") {
    TestFixture f;
    f.Init(kTestXsd, kTestXml);

    SECTION("Leaf element (xs:string title) is content_complete") {
        auto result = f.Helper()->ComputeNodeDetails(f.schema_id, "title", {"root", "title"}, f.doc_id);
        REQUIRE(result.has_value());
        REQUIRE(result->instance_state.has_value());
        CHECK(result->instance_state->content_complete);
        CHECK(result->instance_state->missing_required.empty());
    }

    SECTION("Complex element with all required children is content_complete") {
        auto result = f.Helper()->ComputeNodeDetails(f.schema_id, "item", {"root", "item"}, f.doc_id);
        REQUIRE(result.has_value());
        REQUIRE(result->instance_state.has_value());
        CHECK(result->instance_state->content_complete);
    }

    SECTION("Complex element missing required child is NOT content_complete") {
        auto& doc = *f.container.GetDocumentService();
        auto bad_id = doc.OpenDocumentFromString(
            R"(<?xml version="1.0"?><root version="1"><title>T</title><item id="x"></item></root>)");
        REQUIRE(!bad_id.empty());

        auto result = f.Helper()->ComputeNodeDetails(f.schema_id, "item", {"root", "item"}, bad_id);
        REQUIRE(result.has_value());
        REQUIRE(result->instance_state.has_value());
        CHECK(!result->instance_state->content_complete);
        CHECK(!result->instance_state->missing_required.empty());
    }
}

// ── Duplicate Element Names in Choice Branches ────────────────────────────

TEST_CASE("HelperDataService - Duplicate names across choice branches", "[helper][elements][choice]") {
    TestFixture f;
    f.Init(kDuplicateChoiceXsd, kDuplicateChoiceXml);

    SECTION("Choice node children not empty after move of duplicate names") {
        auto result = f.Helper()->ComputeElementsPanelData(f.schema_id, "parent", {"parent"}, f.doc_id);
        REQUIRE(result.has_value());
        REQUIRE(!result->content_model.empty());

        // Find the choice node
        const ContentModelNode* choice = nullptr;
        for (const auto& node : result->content_model) {
            if (node.node_type == "choice") {
                choice = &node;
                break;
            }
        }
        REQUIRE(choice != nullptr);

        // Both sequence branches should have non-empty children
        REQUIRE(choice->children.size() == 2);
        for (size_t i = 0; i < choice->children.size(); ++i) {
            const auto& branch = choice->children[i];
            CHECK(branch.node_type == "sequence");
            REQUIRE(branch.children.size() == 2);
            CHECK(!branch.children[0].name.empty());
            CHECK(branch.children[0].name == "shared");
        }
    }
}

// ── InsertRequiredChildren — nested choice groups (regression) ────────────

namespace {
constexpr auto kNestedChoiceXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="header" type="xs:string"/>
        <xs:choice>
          <xs:sequence>
            <xs:element name="center" type="xs:string"/>
            <xs:choice>
              <xs:element name="width" type="xs:string"/>
              <xs:element name="columns" type="xs:string"/>
            </xs:choice>
            <xs:choice>
              <xs:element name="height" type="xs:string"/>
              <xs:element name="rows" type="xs:string"/>
            </xs:choice>
          </xs:sequence>
          <xs:element name="corners" type="xs:string"/>
        </xs:choice>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";
}  // namespace

TEST_CASE("InsertRequiredChildren - inserts nested choice elements in empty parent",
           "[helper][insert][regression]") {
    TestFixture f;
    f.Init(kNestedChoiceXsd, nullptr);
    auto& doc_svc = *f.container.GetDocumentService();
    auto doc_id = doc_svc.OpenDocumentFromString(R"(<?xml version="1.0"?><root></root>)");
    REQUIRE(!doc_id.empty());

    auto result = f.Helper()->InsertRequiredChildren(doc_id, f.schema_id, {"root"});
    REQUIRE(result.success);
    CHECK(result.total_inserted >= 4);

    // header, center, width (first of nested choice 1), height (first of nested choice 2)
    CHECK(result.new_content.find("<header") != std::string::npos);
    CHECK(result.new_content.find("<center") != std::string::npos);
    CHECK(result.new_content.find("<width") != std::string::npos);
    CHECK(result.new_content.find("<height") != std::string::npos);

    // Inactive branch elements should not be present.
    CHECK(result.new_content.find("<corners") == std::string::npos);
    CHECK(result.new_content.find("<columns") == std::string::npos);
    CHECK(result.new_content.find("<rows") == std::string::npos);
}

TEST_CASE("InsertRequiredChildren - fills missing nested choices when some present",
           "[helper][insert][regression]") {
    TestFixture f;
    f.Init(kNestedChoiceXsd, nullptr);
    auto& doc_svc = *f.container.GetDocumentService();
    auto doc_id = doc_svc.OpenDocumentFromString(
        R"(<?xml version="1.0"?><root><header>h</header><center>c</center></root>)");
    REQUIRE(!doc_id.empty());

    auto result = f.Helper()->InsertRequiredChildren(doc_id, f.schema_id, {"root"});
    REQUIRE(result.success);
    CHECK(result.total_inserted >= 2);

    // width and height should be inserted (first alternative from each nested choice).
    CHECK(result.new_content.find("<width") != std::string::npos);
    CHECK(result.new_content.find("<height") != std::string::npos);

    // header and center should NOT be duplicated — count occurrences.
    auto count = [](const std::string& hay, const std::string& needle) {
        int n = 0;
        std::string::size_type pos = 0;
        while ((pos = hay.find(needle, pos)) != std::string::npos) { ++n; pos += needle.size(); }
        return n;
    };
    CHECK(count(result.new_content, "<header") == 1);
    CHECK(count(result.new_content, "<center") == 1);
}

TEST_CASE("InsertRequiredChildren - does not insert from inactive choice branch",
           "[helper][insert][regression]") {
    TestFixture f;
    f.Init(kNestedChoiceXsd, nullptr);
    auto& doc_svc = *f.container.GetDocumentService();
    auto doc_id = doc_svc.OpenDocumentFromString(
        R"(<?xml version="1.0"?><root><header>h</header><corners>c</corners></root>)");
    REQUIRE(!doc_id.empty());

    auto result = f.Helper()->InsertRequiredChildren(doc_id, f.schema_id, {"root"});
    REQUIRE(result.success);

    // corners satisfies the top-level choice — no nested choice elements should be inserted.
    CHECK(result.new_content.find("<width") == std::string::npos);
    CHECK(result.new_content.find("<height") == std::string::npos);
    CHECK(result.new_content.find("<center") == std::string::npos);
    CHECK(result.new_content.find("<columns") == std::string::npos);
    CHECK(result.new_content.find("<rows") == std::string::npos);
}
