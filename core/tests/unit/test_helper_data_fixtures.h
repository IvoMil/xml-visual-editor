#pragma once

#include "xmlvisualeditor/services/document_service.h"
#include "xmlvisualeditor/services/helper_data_service.h"
#include "xmlvisualeditor/services/helper_data_service_impl.h"
#include "xmlvisualeditor/services/schema_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>

#include <string>
#include <vector>

using namespace xve;

namespace {

constexpr auto kTestXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="title" type="xs:string"/>
        <xs:element name="description" type="xs:string" minOccurs="0"/>
        <xs:element name="item" type="ItemType" minOccurs="1" maxOccurs="unbounded"/>
        <xs:element name="footer" type="xs:string" minOccurs="0"/>
      </xs:sequence>
      <xs:attribute name="version" type="xs:string" use="required"/>
      <xs:attribute name="lang" use="optional" default="en">
        <xs:simpleType>
          <xs:restriction base="xs:string">
            <xs:enumeration value="en"/>
            <xs:enumeration value="nl"/>
            <xs:enumeration value="de"/>
          </xs:restriction>
        </xs:simpleType>
      </xs:attribute>
    </xs:complexType>
  </xs:element>

  <xs:complexType name="ItemType">
    <xs:sequence>
      <xs:element name="name" type="xs:string"/>
      <xs:element name="value" type="xs:string" minOccurs="0"/>
    </xs:sequence>
    <xs:attribute name="id" type="xs:string" use="required"/>
    <xs:attribute name="status" use="optional">
      <xs:simpleType>
        <xs:restriction base="xs:string">
          <xs:enumeration value="active"/>
          <xs:enumeration value="inactive"/>
          <xs:enumeration value="pending"/>
        </xs:restriction>
      </xs:simpleType>
    </xs:attribute>
  </xs:complexType>
</xs:schema>)";

constexpr auto kChoiceXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="config">
    <xs:complexType>
      <xs:choice>
        <xs:element name="fileSource" type="xs:string"/>
        <xs:element name="dbSource" type="xs:string"/>
        <xs:element name="apiSource" type="xs:string"/>
      </xs:choice>
      <xs:attribute name="name" type="xs:string" use="required"/>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kEmptyXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="marker">
    <xs:complexType>
      <xs:attribute name="id" type="xs:string" use="required"/>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kTestXml = R"(<?xml version="1.0"?>
<root version="1.0" lang="en">
  <title>Test</title>
  <item id="a"><name>Alpha</name></item>
  <item id="b"><name>Beta</name><value>42</value></item>
</root>)";

constexpr auto kChoiceXml = R"(<?xml version="1.0"?>
<config name="myconfig">
  <fileSource>/tmp/data.csv</fileSource>
</config>)";

constexpr auto kEmbeddedChoiceXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="importRun">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="general" type="xs:string"/>
        <xs:choice minOccurs="0">
          <xs:element name="timeSeriesSet" type="xs:string" maxOccurs="unbounded"/>
          <xs:element name="temporary" type="xs:boolean"/>
          <xs:element name="locationId" type="xs:string" maxOccurs="unbounded"/>
          <xs:element name="locationSetId" type="xs:string"/>
        </xs:choice>
        <xs:element name="externUnit" type="xs:string" minOccurs="0" maxOccurs="unbounded"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kEmbeddedChoiceXml = R"(<?xml version="1.0"?>
<importRun>
  <general>test</general>
  <timeSeriesSet>ts1</timeSeriesSet>
</importRun>)";

constexpr auto kEnumElementXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:simpleType name="ValueTypeEnum">
    <xs:restriction base="xs:string">
      <xs:enumeration value="scalar"/>
      <xs:enumeration value="vector"/>
      <xs:enumeration value="accumulative"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:element name="data">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="valueType" type="ValueTypeEnum"/>
        <xs:element name="amount" type="xs:decimal"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kEnumElementXml = R"(<?xml version="1.0"?>
<data>
  <valueType>scalar</valueType>
  <amount>42</amount>
</data>)";

constexpr auto kDuplicateChoiceXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="parent">
    <xs:complexType>
      <xs:sequence>
        <xs:choice>
          <xs:sequence>
            <xs:element name="shared" type="xs:string"/>
            <xs:element name="onlyA" type="xs:string"/>
          </xs:sequence>
          <xs:sequence>
            <xs:element name="shared" type="xs:string"/>
            <xs:element name="onlyB" type="xs:string"/>
          </xs:sequence>
        </xs:choice>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kDuplicateChoiceXml = R"(<?xml version="1.0"?>
<parent>
  <shared>test</shared>
  <onlyA>val</onlyA>
</parent>)";

constexpr auto kUnboundedChoiceXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="workflow">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="description" type="xs:string" minOccurs="0"/>
        <xs:choice minOccurs="1" maxOccurs="unbounded">
          <xs:element name="activity" type="xs:string"/>
          <xs:element name="parallel" type="xs:string"/>
          <xs:element name="sequence" type="xs:string"/>
        </xs:choice>
        <xs:element name="completed" type="xs:boolean" minOccurs="0"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kUnboundedChoiceXml = R"(<?xml version="1.0"?>
<workflow>
  <activity>run1</activity>
</workflow>)";

constexpr auto kAllOptionalChoiceXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="container">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="name" type="xs:string"/>
        <xs:choice>
          <xs:element name="optA" type="xs:string" minOccurs="0"/>
          <xs:element name="optB" type="xs:string" minOccurs="0"/>
        </xs:choice>
        <xs:element name="footer" type="xs:string" minOccurs="0"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kAllOptionalChoiceXml = R"(<?xml version="1.0"?>
<container>
  <name>test</name>
</container>)";

constexpr auto kOptChoiceMinOccursXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:choice minOccurs="0">
          <xs:element name="optA" type="xs:string" minOccurs="1"/>
          <xs:element name="optB" type="xs:string" minOccurs="1"/>
        </xs:choice>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kOptChoiceMinOccursXml = R"(<?xml version="1.0"?>
<root>
  <optA>hello</optA>
</root>)";

// Schema with embedded choice that has no explicit minOccurs attribute.
// XSD default for minOccurs is 1, so the choice itself should be required.
constexpr auto kDefaultMinOccursChoiceXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="settings">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="name" type="xs:string"/>
        <xs:choice>
          <xs:element name="modeA" type="xs:string"/>
          <xs:element name="modeB" type="xs:string"/>
        </xs:choice>
        <xs:element name="footer" type="xs:string" minOccurs="0"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kDefaultMinOccursChoiceXml = R"(<?xml version="1.0"?>
<settings>
  <name>test</name>
</settings>)";

// Schema mimicking FEWS TransformationFunctionComplexType:
// sequence > choice > group ref to a choice with many single-element branches.
constexpr auto kGroupRefChoiceXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:group name="FunctionChoiceGroup">
    <xs:choice>
      <xs:element name="accumulation" type="xs:string"/>
      <xs:element name="aggregation" type="xs:string"/>
      <xs:element name="copy" type="xs:string"/>
      <xs:element name="filter" type="xs:string"/>
      <xs:element name="interpolationSerial" type="xs:string"/>
      <xs:element name="interpolationSpatial" type="xs:string"/>
      <xs:element name="lookup" type="xs:string"/>
      <xs:element name="merge" type="xs:string"/>
      <xs:element name="sample" type="xs:string"/>
      <xs:element name="user" type="xs:string"/>
    </xs:choice>
  </xs:group>
  <xs:group name="RangeTransformationsSequenceGroup">
    <xs:sequence>
      <xs:element name="rangeLimitDef" type="xs:string" minOccurs="0" maxOccurs="unbounded"/>
      <xs:element name="rangeTransformation" type="xs:string" maxOccurs="unbounded"/>
    </xs:sequence>
  </xs:group>
  <xs:element name="transformation">
    <xs:complexType>
      <xs:sequence>
        <xs:choice>
          <xs:group ref="FunctionChoiceGroup"/>
          <xs:group ref="RangeTransformationsSequenceGroup"/>
          <xs:element name="periodTransformation" type="xs:string" maxOccurs="unbounded"/>
        </xs:choice>
        <xs:element name="description" type="xs:string" minOccurs="0"/>
      </xs:sequence>
      <xs:attribute name="id" type="xs:string" use="required"/>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kGroupRefChoiceXml = R"(<?xml version="1.0"?>
<transformation id="t1"/>)";

// Schema mimicking FEWS AdditionComplexType: a complexType whose content model
// is JUST a <choice> with 3 element alternatives (pure choice, no sequence wrapper).
constexpr auto kPureChoiceTypeXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="AdditionType">
    <xs:choice>
      <xs:element name="simpleString" type="xs:string"/>
      <xs:element name="timeZeroFormatting" type="xs:string"/>
      <xs:element name="currentTimeFormatting" type="xs:string"/>
    </xs:choice>
  </xs:complexType>
  <xs:element name="container">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="prefix" type="AdditionType" minOccurs="0"/>
        <xs:element name="suffix" type="AdditionType" minOccurs="0"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

// Schema with element name collision: two elements named "suffix" with different types.
// Tests that InsertRequiredChildren uses type-aware lookup to resolve the correct content model.
constexpr auto kTypeCollisionXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="AdditionType">
    <xs:choice>
      <xs:element name="simpleString" type="xs:string"/>
      <xs:element name="timeZeroFormatting" type="xs:string"/>
    </xs:choice>
  </xs:complexType>
  <xs:complexType name="SimpleListType">
    <xs:sequence>
      <xs:element name="suffix" type="xs:string" minOccurs="0"/>
      <xs:element name="value" type="xs:string"/>
    </xs:sequence>
  </xs:complexType>
  <xs:element name="export">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="simpleList" type="SimpleListType" minOccurs="0"/>
        <xs:element name="prefix" type="AdditionType" minOccurs="0"/>
        <xs:element name="suffix" type="AdditionType" minOccurs="0"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

// Regression: unbounded choice should propagate max_occurs to child elements.
constexpr auto kUnboundedChoiceCardinalityXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="root">
    <xs:complexType>
      <xs:sequence>
        <xs:choice maxOccurs="unbounded">
          <xs:element name="alpha" type="xs:string"/>
          <xs:element name="beta" type="xs:string"/>
        </xs:choice>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kUnboundedChoiceCardinalityXml =
    R"(<?xml version="1.0"?><root><alpha>1</alpha><alpha>2</alpha><beta>3</beta></root>)";

// Regression Bug L: unbounded sequence should propagate max_occurs to child elements.
// E.g. <xs:sequence maxOccurs="unbounded"><xs:element name="enumeration"/></xs:sequence>
constexpr auto kUnboundedSequenceCardinalityXsd = R"(<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="enumerations">
    <xs:complexType>
      <xs:sequence maxOccurs="unbounded">
        <xs:element name="enumeration" type="xs:string"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>)";

constexpr auto kUnboundedSequenceCardinalityXml =
    R"(<?xml version="1.0"?><enumerations><enumeration>A</enumeration><enumeration>B</enumeration><enumeration>C</enumeration></enumerations>)";

// Schema with minInclusive/maxInclusive range facets.
constexpr auto kRangeRestrictionsXsd = R"(<schema xmlns="http://www.w3.org/2001/XMLSchema">
  <simpleType name="PercentType">
    <restriction base="integer">
      <minInclusive value="0"/>
      <maxInclusive value="100"/>
    </restriction>
  </simpleType>
  <element name="data">
    <complexType><sequence>
      <element name="score" type="PercentType"/>
    </sequence></complexType>
  </element>
</schema>)";

constexpr auto kRangeRestrictionsXml = R"(<?xml version="1.0"?><data><score>50</score></data>)";

// Schema with minExclusive/maxExclusive facets.
constexpr auto kExclusiveRestrictionsXsd = R"(<schema xmlns="http://www.w3.org/2001/XMLSchema">
  <simpleType name="PositiveDecimal">
    <restriction base="decimal">
      <minExclusive value="0"/>
      <maxExclusive value="1000"/>
    </restriction>
  </simpleType>
  <element name="data">
    <complexType><sequence>
      <element name="amount" type="PositiveDecimal"/>
    </sequence></complexType>
  </element>
</schema>)";

constexpr auto kExclusiveRestrictionsXml = R"(<?xml version="1.0"?><data><amount>42.5</amount></data>)";

// Schema with pattern facet.
constexpr auto kPatternRestrictionXsd = R"(<schema xmlns="http://www.w3.org/2001/XMLSchema">
  <simpleType name="CodeType">
    <restriction base="string">
      <pattern value="[A-Z]+"/>
    </restriction>
  </simpleType>
  <element name="data">
    <complexType><sequence>
      <element name="code" type="CodeType"/>
    </sequence></complexType>
  </element>
</schema>)";

constexpr auto kPatternRestrictionXml = R"(<?xml version="1.0"?><data><code>ABC</code></data>)";

// Schema with appinfo on element annotation.
constexpr auto kAppinfoXsd = R"(<schema xmlns="http://www.w3.org/2001/XMLSchema">
  <element name="data">
    <complexType><sequence>
      <element name="item" type="string">
        <annotation><appinfo>Custom hint for editors</appinfo></annotation>
      </element>
    </sequence></complexType>
  </element>
</schema>)";

constexpr auto kAppinfoXml = R"(<?xml version="1.0"?><data><item>hello</item></data>)";

// Schema with unrestricted simple type (no facets).
constexpr auto kNoRestrictionsXsd = R"(<schema xmlns="http://www.w3.org/2001/XMLSchema">
  <element name="data">
    <complexType><sequence>
      <element name="value" type="string"/>
    </sequence></complexType>
  </element>
</schema>)";

constexpr auto kNoRestrictionsXml = R"(<?xml version="1.0"?><data><value>anything</value></data>)";

struct TestFixture {
    ServiceContainer container;
    std::string schema_id;
    std::string doc_id;

    void Init(const char* xsd, const char* xml) {
        container.Initialize();
        auto& schema = *container.GetSchemaService();
        schema_id = "test_schema";
        REQUIRE(schema.LoadSchemaFromString(schema_id, xsd));
        if (xml) {
            auto& doc = *container.GetDocumentService();
            doc_id = doc.OpenDocumentFromString(xml);
            REQUIRE(!doc_id.empty());
        }
    }

    auto Helper() -> IHelperDataService* { return container.GetHelperDataService(); }
};

}  // namespace
