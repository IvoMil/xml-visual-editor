#include "xmlvisualeditor/jsonrpc/jsonrpc_server.h"
#include "xmlvisualeditor/jsonrpc/method_handlers.h"
#include "xmlvisualeditor/services/schema_service.h"
#include "xmlvisualeditor/services/service_container.h"

#include <nlohmann/json.hpp>

#include <stdexcept>
#include <string>

namespace xve {

void RegisterSchemaHandlers(JsonRpcServer& server) {
    server.RegisterMethod("schema.load",
                          [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
                              if (!params.contains("schema_id") || !params["schema_id"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: schema_id");
                              }
                              if (!params.contains("file_path") || !params["file_path"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: file_path");
                              }
                              bool success = container.GetSchemaService()->LoadSchemaFromFile(
                                  params["schema_id"].get<std::string>(), params["file_path"].get<std::string>());
                              return {{"success", success}};
                          });

    server.RegisterMethod("schema.loadFromString",
                          [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
                              if (!params.contains("schema_id") || !params["schema_id"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: schema_id");
                              }
                              if (!params.contains("content") || !params["content"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: content");
                              }
                              bool success = container.GetSchemaService()->LoadSchemaFromString(
                                  params["schema_id"].get<std::string>(), params["content"].get<std::string>());
                              return {{"success", success}};
                          });

    server.RegisterMethod(
        "schema.unload", [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
            if (!params.contains("schema_id") || !params["schema_id"].is_string()) {
                throw std::invalid_argument("Missing required parameter: schema_id");
            }
            bool success = container.GetSchemaService()->UnloadSchema(params["schema_id"].get<std::string>());
            return {{"success", success}};
        });

    server.RegisterMethod(
        "schema.getRootElements", [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
            if (!params.contains("schema_id") || !params["schema_id"].is_string()) {
                throw std::invalid_argument("Missing required parameter: schema_id");
            }
            auto elements = container.GetSchemaService()->GetRootElements(params["schema_id"].get<std::string>());
            return {{"elements", elements}};
        });

    server.RegisterMethod(
        "schema.getElementInfo", [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
            if (!params.contains("schema_id") || !params["schema_id"].is_string()) {
                throw std::invalid_argument("Missing required parameter: schema_id");
            }
            if (!params.contains("element_name") || !params["element_name"].is_string()) {
                throw std::invalid_argument("Missing required parameter: element_name");
            }
            auto info = container.GetSchemaService()->GetElementInfo(params["schema_id"].get<std::string>(),
                                                                     params["element_name"].get<std::string>());
            if (!info.has_value()) {
                throw std::runtime_error("Element not found: " + params["element_name"].get<std::string>());
            }
            return {{"element_info",
                     {{"name", info->name},
                      {"namespace_uri", info->namespace_uri},
                      {"type_name", info->type_name},
                      {"min_occurs", info->min_occurs},
                      {"max_occurs", info->max_occurs},
                      {"nillable", info->nillable},
                      {"is_abstract", info->is_abstract},
                      {"substitution_group", info->substitution_group},
                      {"default_value", info->default_value},
                      {"fixed_value", info->fixed_value},
                      {"documentation", info->documentation}}}};
        });

    server.RegisterMethod("schema.getAllowedChildren",
                          [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
                              if (!params.contains("schema_id") || !params["schema_id"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: schema_id");
                              }
                              if (!params.contains("element_name") || !params["element_name"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: element_name");
                              }
                              auto children = container.GetSchemaService()->GetAllowedChildren(
                                  params["schema_id"].get<std::string>(), params["element_name"].get<std::string>());
                              return {{"children", children}};
                          });

    server.RegisterMethod("schema.getAllowedAttributes",
                          [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
                              if (!params.contains("schema_id") || !params["schema_id"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: schema_id");
                              }
                              if (!params.contains("element_name") || !params["element_name"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: element_name");
                              }
                              auto attrs = container.GetSchemaService()->GetAllowedAttributes(
                                  params["schema_id"].get<std::string>(), params["element_name"].get<std::string>());
                              auto result = nlohmann::json::array();
                              for (const auto& [attr_name, attr_info] : attrs) {
                                  result.push_back({{"name", attr_info.name},
                                                    {"type_name", attr_info.type_name},
                                                    {"required", attr_info.required},
                                                    {"default_value", attr_info.default_value},
                                                    {"use", attr_info.use}});
                              }
                              return {{"attributes", result}};
                          });

    server.RegisterMethod("schema.getEnumerationValues",
                          [](const nlohmann::json& params, ServiceContainer& container) -> nlohmann::json {
                              if (!params.contains("schema_id") || !params["schema_id"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: schema_id");
                              }
                              if (!params.contains("type_name") || !params["type_name"].is_string()) {
                                  throw std::invalid_argument("Missing required parameter: type_name");
                              }
                              auto values = container.GetSchemaService()->GetEnumerationValues(
                                  params["schema_id"].get<std::string>(), params["type_name"].get<std::string>());
                              return {{"values", values}};
                          });
}

}  // namespace xve
