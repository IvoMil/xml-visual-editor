#include "xmlvisualeditor/core/document.h"
#include "xmlvisualeditor/services/document_service_impl.h"
#include "xmlvisualeditor/services/file_service_impl.h"
#include "xmlvisualeditor/services/service_container.h"
#include "xmlvisualeditor/services/validation_service_impl.h"
#include "xmlvisualeditor/version.h"

#include <catch2/catch_test_macros.hpp>

#include <filesystem>

using namespace xve;

TEST_CASE("ServiceContainer initialize/shutdown and getters", "[services][container]") {
    ServiceContainer sc;
    REQUIRE(!sc.IsInitialized());
    sc.Initialize();
    CHECK(sc.IsInitialized());
    CHECK(sc.GetDocumentService() != nullptr);
    CHECK(sc.GetFileService() != nullptr);
    CHECK(sc.GetValidationService() != nullptr);
    sc.Shutdown();
    CHECK(!sc.IsInitialized());
}

TEST_CASE("DocumentServiceImpl open/get/update/close", "[services][document]") {
    DocumentServiceImpl svc;

    auto id = svc.OpenDocumentFromString("<root><n/></root>");
    REQUIRE(!id.empty());

    auto content = svc.GetDocumentContent(id);
    REQUIRE(content.has_value());
    CHECK(content->find("<root") != std::string::npos);

    bool updated = svc.UpdateDocumentContent(id, "<root><n>changed</n></root>");
    CHECK(updated == true);

    auto docptr = svc.GetDocument(id);
    REQUIRE(docptr != nullptr);
    CHECK(docptr->Root().FirstChild().Text() == "changed");

    svc.CloseDocument(id);
    CHECK(svc.GetDocument(id) == nullptr);
}

TEST_CASE("FileServiceImpl read/write/exists with temp files", "[services][file]") {
    FileServiceImpl fs;
    auto tmpdir = std::filesystem::temp_directory_path();
    auto tmpfile = tmpdir / "xve_test_tmpfile.xml";
    if (std::filesystem::exists(tmpfile))
        std::filesystem::remove(tmpfile);

    auto wres = fs.WriteFile(tmpfile, "<root/>\n");
    REQUIRE(wres.has_value());
    CHECK(fs.FileExists(tmpfile));

    auto rres = fs.ReadFile(tmpfile);
    REQUIRE(rres.has_value());
    CHECK(rres.value().find("root") != std::string::npos);

    std::filesystem::remove(tmpfile);
}

TEST_CASE("ValidationServiceImpl well-formedness checks", "[services][validation]") {
    // ValidationServiceImpl takes a DocumentService pointer, use local DocumentServiceImpl
    DocumentServiceImpl docsvc;
    ValidationServiceImpl vs(&docsvc, nullptr);

    auto good = vs.ValidateWellFormedness("<root><a/></root>");
    CHECK(good.empty());

    auto bad = vs.ValidateWellFormedness("<root><a></root>");
    CHECK(!bad.empty());
}
