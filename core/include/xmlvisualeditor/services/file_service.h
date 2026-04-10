#pragma once

#include <expected>
#include <filesystem>
#include <string>
#include <string_view>

namespace xve {

class IFileService {
public:
    virtual ~IFileService() = default;

    virtual auto ReadFile(const std::filesystem::path& path) -> std::expected<std::string, std::string> = 0;
    virtual auto WriteFile(const std::filesystem::path& path, std::string_view content)
        -> std::expected<void, std::string> = 0;
    virtual bool FileExists(const std::filesystem::path& path) const = 0;
};

}  // namespace xve
