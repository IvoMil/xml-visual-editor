// Performance regression test — asserts gridView.getTreeData (build +
// direct-to-string serialisation) on SpatialDisplay.xml completes within a
// generous Debug-build threshold. Tagged [perf] so it can be filtered out of
// normal CI runs if desired.

#include "test_fixture_helpers.h"
#include "xmlvisualeditor/services/document_service.h"
#include "xmlvisualeditor/services/grid_view_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <catch2/catch_test_macros.hpp>

#include <algorithm>
#include <chrono>
#include <string>
#include <vector>

using namespace xve;

TEST_CASE("GridViewService getTreeData perf on SpatialDisplay.xml", "[gridview][perf]") {
    auto fixture = xve::test::FindFixture("resources/sample_files/SpatialDisplay.xml");
    if (fixture.empty()) {
        WARN("SpatialDisplay.xml fixture not found — skipping perf test");
        return;
    }

    const std::string xml = xve::test::ReadFileToString(fixture);
    REQUIRE(!xml.empty());

    ServiceContainer container;
    container.Initialize();
    auto* doc_service = container.GetDocumentService();
    auto* grid_service = container.GetGridViewService();
    REQUIRE(doc_service != nullptr);
    REQUIRE(grid_service != nullptr);

    auto doc_id = doc_service->OpenDocumentFromString(xml);
    REQUIRE(!doc_id.empty());

    // Measure the full engine-side operation: tree build + JSON string
    // serialisation. This is what the JSON-RPC raw-handler path exercises
    // end-to-end (minus stdio framing).
    using Clock = std::chrono::steady_clock;
    constexpr int kRuns = 3;
    std::vector<double> millis;
    millis.reserve(kRuns);
    for (int i = 0; i < kRuns; ++i) {
        auto t0 = Clock::now();
        auto json = grid_service->GetTreeDataJson(doc_id);
        auto t_end = Clock::now();
        REQUIRE(json.has_value());
        REQUIRE(!json->empty());
        millis.push_back(std::chrono::duration<double, std::milli>(t_end - t0).count());
    }

    std::sort(millis.begin(), millis.end());
    const double median = millis[millis.size() / 2];

    INFO("GetTreeDataJson times (ms): "
         << millis[0] << " " << millis[1] << " " << millis[2] << " median=" << median);
    // Generous Debug-build ceiling. Target ~300ms after the direct-to-string
    // optimisation (observed Debug engine-only was ~3.8s before); 1500ms
    // absorbs CI noise without hiding regressions.
    CHECK(median < 1500.0);

    doc_service->CloseDocument(doc_id);
}
