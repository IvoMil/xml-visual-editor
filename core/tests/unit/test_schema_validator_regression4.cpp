// Regression tests for Bug A: xs:include with maxOccurs="unbounded" incorrectly reports maxOccurs=1.
// Tests the fix for element_cache_ collision when a global element with the same name
// shadows the local content-model element's max_occurs value.

#include "xmlvisualeditor/schema/schema_parser.h"
#include "xmlvisualeditor/schema/schema_validator.h"
#include "xmlvisualeditor/services/schema_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>

#include <filesystem>
#include <fstream>
#include <string>

using namespace xve;

namespace {

/// Helper: write string content to a file, creating parent dirs if needed.
void WriteFile(const std::filesystem::path& path, std::string_view content) {
    std::ofstream ofs(path, std::ios::binary);
    ofs.write(content.data(), static_cast<std::streamsize>(content.size()));
}

/// Helper: validate XML against an XSD loaded from file and return diagnostics.
auto ValidateWithFileSchema(const std::filesystem::path& xsd_path, std::string_view xml) -> std::vector<Diagnostic> {
    ServiceContainer sc;
    sc.Initialize();
    auto* schema_svc = sc.GetSchemaService();
    bool loaded = schema_svc->LoadSchemaFromFile("test_schema", xsd_path.string());
    if (!loaded) {
        return {};
    }
    auto diags = SchemaValidator::Validate(xml, *schema_svc, "test_schema");
    sc.Shutdown();
    return diags;
}

/// RAII cleanup helper for temp files/directories.
struct TempDir {
    std::filesystem::path path;
    TempDir() : path(std::filesystem::temp_directory_path() / "xve_bugA_test") {
        std::filesystem::create_directories(path);
    }
    ~TempDir() { std::filesystem::remove_all(path); }
};

// ── Inline (no include) tests — these should always pass ────────────────

constexpr const char* kInlineUnboundedXsd = R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="ContainerType">
    <xs:sequence>
      <xs:element name="item" type="xs:string" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="container" type="ContainerType"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)";

}  // namespace

TEST_CASE("bugA: inline unbounded sequence - no false positive", "[bugA][validator]") {
    ServiceContainer sc;
    sc.Initialize();
    auto* schema_svc = sc.GetSchemaService();
    bool loaded = schema_svc->LoadSchemaFromString("s1", kInlineUnboundedXsd);
    REQUIRE(loaded);

    auto xml = R"(<root><container><item>1</item><item>2</item><item>3</item><item>4</item><item>5</item><item>6</item><item>7</item><item>8</item><item>9</item></container></root>)";
    auto diags = SchemaValidator::Validate(xml, *schema_svc, "s1");

    for (const auto& d : diags) {
        INFO("Diagnostic: " << d.message);
        CHECK(d.message.find("Too many") == std::string::npos);
    }
    CHECK(diags.empty());
    sc.Shutdown();
}

// ── Include tests — reproduce the FEWS schema pattern ───────────────────

TEST_CASE("bugA: xs:include with maxOccurs='unbounded' - no false positive", "[bugA][validator]") {
    TempDir tmp;

    // shared.xsd: defines a type with maxOccurs="unbounded" child + a global element with same name
    WriteFile(tmp.path / "shared.xsd", R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="ContainerType">
    <xs:sequence>
      <xs:element name="item" type="xs:string" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="item" type="xs:string"/>
</xs:schema>
)");

    // main.xsd: includes shared.xsd, has root with a child of ContainerType
    WriteFile(tmp.path / "main.xsd", R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:include schemaLocation="shared.xsd"/>
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="container" type="ContainerType"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)");

    auto xml = R"(<root><container><item>1</item><item>2</item><item>3</item><item>4</item><item>5</item><item>6</item><item>7</item><item>8</item><item>9</item></container></root>)";
    auto diags = ValidateWithFileSchema(tmp.path / "main.xsd", xml);

    for (const auto& d : diags) {
        INFO("Diagnostic: " << d.message);
        CHECK(d.message.find("Too many") == std::string::npos);
    }
    CHECK(diags.empty());
}

TEST_CASE("bugA: xs:include without global element - no false positive", "[bugA][validator]") {
    TempDir tmp;

    // shared.xsd: type only, no global element collision
    WriteFile(tmp.path / "shared.xsd", R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="ContainerType">
    <xs:sequence>
      <xs:element name="item" type="xs:string" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>
)");

    WriteFile(tmp.path / "main.xsd", R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:include schemaLocation="shared.xsd"/>
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="container" type="ContainerType"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)");

    auto xml = R"(<root><container><item>1</item><item>2</item><item>3</item><item>4</item><item>5</item><item>6</item><item>7</item><item>8</item><item>9</item></container></root>)";
    auto diags = ValidateWithFileSchema(tmp.path / "main.xsd", xml);

    for (const auto& d : diags) {
        INFO("Diagnostic: " << d.message);
        CHECK(d.message.find("Too many") == std::string::npos);
    }
    CHECK(diags.empty());
}

TEST_CASE("bugA: FEWS-like pattern - no-prefix XSD namespace with include", "[bugA][validator]") {
    TempDir tmp;

    // Simulates the FEWS schema: default namespace = XSD namespace (no xs: prefix),
    // target namespace with a prefix
    WriteFile(tmp.path / "sharedTypes.xsd", R"(
<schema xmlns="http://www.w3.org/2001/XMLSchema"
        xmlns:fews="http://www.wldelft.nl/fews"
        targetNamespace="http://www.wldelft.nl/fews"
        elementFormDefault="qualified">
  <complexType name="TimeSeriesValueEnumerationsComplexType">
    <sequence>
      <element name="enumeration" maxOccurs="unbounded" type="fews:TimeSeriesValueEnumerationComplexType"/>
    </sequence>
  </complexType>
  <complexType name="TimeSeriesValueEnumerationComplexType">
    <sequence>
      <element name="value" type="string" maxOccurs="unbounded"/>
    </sequence>
    <attribute name="id" type="string" use="required"/>
  </complexType>
</schema>
)");

    WriteFile(tmp.path / "parameters.xsd", R"(
<schema xmlns="http://www.w3.org/2001/XMLSchema"
        xmlns:fews="http://www.wldelft.nl/fews"
        targetNamespace="http://www.wldelft.nl/fews"
        elementFormDefault="qualified">
  <include schemaLocation="sharedTypes.xsd"/>
  <element name="parameters">
    <complexType>
      <sequence>
        <element name="enumerations" type="fews:TimeSeriesValueEnumerationsComplexType" minOccurs="0"/>
      </sequence>
    </complexType>
  </element>
</schema>
)");

    auto xml = R"(<?xml version="1.0" encoding="UTF-8"?>
<parameters xmlns="http://www.wldelft.nl/fews">
  <enumerations>
    <enumeration id="e1"><value code="1" label="a"/></enumeration>
    <enumeration id="e2"><value code="2" label="b"/></enumeration>
    <enumeration id="e3"><value code="3" label="c"/></enumeration>
    <enumeration id="e4"><value code="4" label="d"/></enumeration>
    <enumeration id="e5"><value code="5" label="e"/></enumeration>
    <enumeration id="e6"><value code="6" label="f"/></enumeration>
    <enumeration id="e7"><value code="7" label="g"/></enumeration>
    <enumeration id="e8"><value code="8" label="h"/></enumeration>
    <enumeration id="e9"><value code="9" label="i"/></enumeration>
  </enumerations>
</parameters>)";

    auto diags = ValidateWithFileSchema(tmp.path / "parameters.xsd", xml);

    for (const auto& d : diags) {
        INFO("Diagnostic: " << d.message);
        CHECK(d.message.find("Too many") == std::string::npos);
    }
}

TEST_CASE("bugA: include maxOccurs=1 is correctly enforced", "[bugA][validator]") {
    TempDir tmp;

    WriteFile(tmp.path / "shared.xsd", R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="ContainerType">
    <xs:sequence>
      <xs:element name="item" type="xs:string" maxOccurs="1"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>
)");

    WriteFile(tmp.path / "main.xsd", R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:include schemaLocation="shared.xsd"/>
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="container" type="ContainerType"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)");

    auto xml_ok = R"(<root><container><item>1</item></container></root>)";
    auto diags_ok = ValidateWithFileSchema(tmp.path / "main.xsd", xml_ok);
    CHECK(diags_ok.empty());

    auto xml_bad = R"(<root><container><item>1</item><item>2</item></container></root>)";
    auto diags_bad = ValidateWithFileSchema(tmp.path / "main.xsd", xml_bad);

    bool found_too_many = false;
    for (const auto& d : diags_bad) {
        if (d.message.find("Too many") != std::string::npos) {
            found_too_many = true;
        }
    }
    CHECK(found_too_many);
}

TEST_CASE("bugA: global element same name different maxOccurs - content model wins", "[bugA][validator]") {
    TempDir tmp;

    // shared.xsd: global element "item" (no maxOccurs → defaults to 1)
    // AND a type where "item" has maxOccurs="unbounded"
    WriteFile(tmp.path / "shared.xsd", R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="item" type="xs:string"/>
  <xs:complexType name="ContainerType">
    <xs:sequence>
      <xs:element name="item" type="xs:string" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>
)");

    WriteFile(tmp.path / "main.xsd", R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:include schemaLocation="shared.xsd"/>
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="container" type="ContainerType"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)");

    auto xml = R"(<root><container><item>1</item><item>2</item><item>3</item><item>4</item><item>5</item><item>6</item><item>7</item><item>8</item><item>9</item></container></root>)";
    auto diags = ValidateWithFileSchema(tmp.path / "main.xsd", xml);

    for (const auto& d : diags) {
        INFO("Diagnostic: " << d.message);
        CHECK(d.message.find("Too many") == std::string::npos);
    }
    CHECK(diags.empty());
}

TEST_CASE("bugA: element ref with maxOccurs='unbounded' + global element", "[bugA][validator]") {
    TempDir tmp;

    // shared.xsd: global element "item" AND a type that references it via ref
    WriteFile(tmp.path / "shared.xsd", R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="item" type="xs:string"/>
  <xs:complexType name="ContainerType">
    <xs:sequence>
      <xs:element ref="item" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:complexType>
</xs:schema>
)");

    WriteFile(tmp.path / "main.xsd", R"(
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:include schemaLocation="shared.xsd"/>
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="container" type="ContainerType"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
)");

    auto xml = R"(<root><container><item>1</item><item>2</item><item>3</item><item>4</item><item>5</item><item>6</item><item>7</item><item>8</item><item>9</item></container></root>)";
    auto diags = ValidateWithFileSchema(tmp.path / "main.xsd", xml);

    for (const auto& d : diags) {
        INFO("Diagnostic: " << d.message);
        CHECK(d.message.find("Too many") == std::string::npos);
    }
    CHECK(diags.empty());
}
