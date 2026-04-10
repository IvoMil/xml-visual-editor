#pragma once

#include "xmlvisualeditor/core/document.h"

#include <string>
#include <string_view>
#include <vector>

namespace xve {

class IValidationService {
public:
    virtual ~IValidationService() = default;

    virtual auto ValidateWellFormedness(std::string_view xml_content) -> std::vector<Diagnostic> = 0;
    virtual auto ValidateDocument(const std::string& doc_id) -> std::vector<Diagnostic> = 0;
    virtual auto ValidateAgainstSchema(std::string_view xml_content, const std::string& schema_id)
        -> std::vector<Diagnostic> = 0;
};

}  // namespace xve
