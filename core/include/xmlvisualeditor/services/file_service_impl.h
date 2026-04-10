#pragma once

#include "xmlvisualeditor/services/file_service.h"

namespace xve {

class FileServiceImpl : public IFileService {
public:
    auto ReadFile(const std::filesystem::path& path) -> std::expected<std::string, std::string> override;
    auto WriteFile(const std::filesystem::path& path, std::string_view content)
        -> std::expected<void, std::string> override;
    bool FileExists(const std::filesystem::path& path) const override;
};

}  // namespace xve
