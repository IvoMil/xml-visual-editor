#include "xmlvisualeditor/jsonrpc/method_handlers.h"

#include "xmlvisualeditor/core/document.h"
#include "xmlvisualeditor/jsonrpc/jsonrpc_server.h"
#include "xmlvisualeditor/services/document_service.h"
#include "xmlvisualeditor/services/service_container.h"
#include "xmlvisualeditor/services/validation_service.h"

#include <nlohmann/json.hpp>

#include <stdexcept>
#include <string>

namespace xve {

void RegisterDocumentHandlers(JsonRpcServer& server) {
    server.RegisterMethod(
        "document.open", [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
            if (!params.contains("path") || !params["path"].is_string()) {
                throw std::invalid_argument("Missing required parameter: path");
            }
            auto doc_id = container.GetDocumentService()->OpenDocument(params["path"].get<std::string>());
            return {{"doc_id", doc_id}};
        });

    server.RegisterMethod(
        "document.openFromString", [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
            if (!params.contains("content") || !params["content"].is_string()) {
                throw std::invalid_argument("Missing required parameter: content");
            }
            auto doc_id = container.GetDocumentService()->OpenDocumentFromString(params["content"].get<std::string>());
            return {{"doc_id", doc_id}};
        });

    server.RegisterMethod("document.close",
                          [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
                              if (!params.contains("doc_id") || !params["doc_id"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: doc_id");
                              }
                              container.GetDocumentService()->CloseDocument(params["doc_id"].get<std::string>());
                              return {{"success", true}};
                          });

    server.RegisterMethod(
        "document.getContent", [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
            if (!params.contains("doc_id") || !params["doc_id"].is_string()) {
                throw std::invalid_argument("Missing required parameter: doc_id");
            }
            auto content = container.GetDocumentService()->GetDocumentContent(params["doc_id"].get<std::string>());
            if (!content.has_value()) {
                throw std::runtime_error("Document not found: " + params["doc_id"].get<std::string>());
            }
            return {{"content", content.value()}};
        });

    server.RegisterMethod("document.update",
                          [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
                              if (!params.contains("doc_id") || !params["doc_id"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: doc_id");
                              }
                              if (!params.contains("content") || !params["content"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: content");
                              }
                              bool success = container.GetDocumentService()->UpdateDocumentContent(
                                  params["doc_id"].get<std::string>(), params["content"].get<std::string>());
                              return {{"success", success}};
                          });

    server.RegisterMethod(
        "document.prettyPrint", [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
            if (!params.contains("doc_id") || !params["doc_id"].is_string()) {
                throw std::invalid_argument("Missing required parameter: doc_id");
            }
            auto* doc = container.GetDocumentService()->GetDocument(params["doc_id"].get<std::string>());
            if (!doc) {
                throw std::runtime_error("Document not found: " + params["doc_id"].get<std::string>());
            }
            std::string indent = "    ";
            if (params.contains("indent") && params["indent"].is_string()) {
                indent = params["indent"].get<std::string>();
            }
            return {{"content", doc->ToString(true, indent)}};
        });

    server.RegisterMethod(
        "document.linearize", [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
            if (!params.contains("doc_id") || !params["doc_id"].is_string()) {
                throw std::invalid_argument("Missing required parameter: doc_id");
            }
            auto* doc = container.GetDocumentService()->GetDocument(params["doc_id"].get<std::string>());
            if (!doc) {
                throw std::runtime_error("Document not found: " + params["doc_id"].get<std::string>());
            }
            return {{"content", doc->ToString(false)}};
        });
}

void RegisterValidationHandlers(JsonRpcServer& server) {
    server.RegisterMethod("validation.validateWellFormedness",
                          [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
                              if (!params.contains("content") || !params["content"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: content");
                              }
                              auto diagnostics = container.GetValidationService()->ValidateWellFormedness(
                                  params["content"].get<std::string>());
                              auto result = nlohmann::json::array();
                              for (const auto& diag : diagnostics) {
                                  result.push_back({{"line", diag.line},
                                                    {"column", diag.column},
                                                    {"message", diag.message},
                                                    {"severity", diag.severity},
                                                    {"element_path", diag.element_path}});
                              }
                              return {{"diagnostics", result}};
                          });

    server.RegisterMethod("validation.validateSchema",
                          [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
                              if (!params.contains("content") || !params["content"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: content");
                              }
                              if (!params.contains("schema_id") || !params["schema_id"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: schema_id");
                              }
                              auto diagnostics = container.GetValidationService()->ValidateAgainstSchema(
                                  params["content"].get<std::string>(), params["schema_id"].get<std::string>());
                              auto result = nlohmann::json::array();
                              for (const auto& diag : diagnostics) {
                                  result.push_back({{"line", diag.line},
                                                    {"column", diag.column},
                                                    {"message", diag.message},
                                                    {"severity", diag.severity},
                                                    {"element_path", diag.element_path}});
                              }
                              return {{"diagnostics", result}};
                          });
}

}  // namespace xve
