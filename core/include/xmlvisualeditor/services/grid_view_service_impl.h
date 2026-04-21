#pragma once

#include "xmlvisualeditor/services/grid_view_service.h"

namespace xve {

class IDocumentService;

class GridViewServiceImpl : public IGridViewService {
public:
    explicit GridViewServiceImpl(IDocumentService* document_service);
    auto GetTreeData(const std::string& doc_id) -> std::optional<GridTreeNode> override;
    auto GetTreeDataJson(const std::string& doc_id) -> std::optional<std::string> override;

private:
    IDocumentService* document_service_;
};

}  // namespace xve
