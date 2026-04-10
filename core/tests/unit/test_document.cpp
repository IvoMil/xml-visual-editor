#include "xmlvisualeditor/core/document.h"
#include "xmlvisualeditor/version.h"

#include <catch2/catch_test_macros.hpp>

using namespace xve;

TEST_CASE("Document - parse valid and invalid XML", "[document][parse]") {
    SECTION("valid XML") {
        auto [doc, res] = Document::ParseString("<root><child id=\"1\">text</child></root>");
        REQUIRE(doc != nullptr);
        CHECK(res.success == true);
        CHECK(doc->Root().Name() == "root");
        CHECK(doc->Root().FirstChild().Name() == "child");
        CHECK(doc->Root().FirstChild().Text() == "text");
    }

    SECTION("invalid XML") {
        auto [doc, res] = Document::ParseString("<root><unclosed></root>");
        CHECK_FALSE(res.success);
        CHECK(res.diagnostics.size() >= 1);
    }
}

TEST_CASE("Document - create, serialize and round-trip", "[document][serialize]") {
    auto doc = Document::Create("root");
    REQUIRE(doc != nullptr);
    auto root = doc->Root();
    REQUIRE(root);

    root.SetAttribute("lang", "en");
    auto s = doc->ToString();
    REQUIRE(!s.empty());

    auto [doc2, res2] = Document::ParseString(s);
    REQUIRE(doc2 != nullptr);
    CHECK(res2.success == true);
    CHECK(doc2->Root().HasAttribute("lang"));
    CHECK(doc2->Root().GetAttribute("lang") == "en");
}

TEST_CASE("Element attributes CRUD and listing", "[element][attributes]") {
    auto doc = Document::Create("root");
    auto root = doc->Root();

    root.SetAttribute("a", "1");
    root.SetAttribute("b", "two");
    CHECK(root.HasAttribute("a"));
    CHECK(root.GetAttribute("a") == "1");

    auto attrs = root.GetAttributes();
    CHECK(attrs.size() >= 2);

    root.RemoveAttribute("a");
    CHECK(!root.HasAttribute("a"));
}

TEST_CASE("Navigation and mutation: parent/child/sibling and append/insert/remove", "[element][mutation]") {
    auto doc = Document::Create("root");
    auto root = doc->Root();

    auto a = root.AppendChild("a");
    auto b = root.AppendChild("b");
    auto c = root.AppendChild("c");

    REQUIRE(a);
    REQUIRE(b);
    REQUIRE(c);

    CHECK(a.NextSibling().Name() == "b");
    CHECK(b.PreviousSibling().Name() == "a");

    auto inserted = root.InsertChildBefore("inserted", b);
    REQUIRE(inserted);
    CHECK(inserted.NextSibling().Name() == "b");

    bool removed = root.RemoveChild(b);
    CHECK(removed == true);
    CHECK(inserted.NextSibling().Name() != "b");
}

TEST_CASE("Element GetPath and nested structure", "[element][path]") {
    auto doc = Document::Create("root");
    auto root = doc->Root();
    auto child = root.AppendChild("child");
    auto grand = child.AppendChild("grand");

    CHECK(grand.GetPath().find("/root/child/grand") != std::string::npos);
}

TEST_CASE("Schema URL detection (xsi:noNamespaceSchemaLocation and xsi:schemaLocation)", "[document][schema]") {
    const char* xml1 =
        R"(<root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://example.com/schema.xsd"></root>)";
    auto [d1, r1] = Document::ParseString(xml1);
    REQUIRE(d1 != nullptr);
    auto s1 = d1->DetectSchemaUrl();
    REQUIRE(s1.has_value());
    CHECK(s1->find("example.com") != std::string::npos);

    const char* xml2 =
        R"(<root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://example.com schema.xsd"></root>)";
    auto [d2, r2] = Document::ParseString(xml2);
    REQUIRE(d2 != nullptr);
    auto s2 = d2->DetectSchemaUrl();
    REQUIRE(s2.has_value());
    CHECK(s2->find("example.com") != std::string::npos);
}
