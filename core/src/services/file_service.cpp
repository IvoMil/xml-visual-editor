#include "xmlvisualeditor/services/file_service_impl.h"

#include <filesystem>
#include <fstream>
#include <sstream>

namespace xve {

auto FileServiceImpl::ReadFile(const std::filesystem::path& path) -> std::expected<std::string, std::string> {
    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) {
        return std::unexpected("Failed to open file: " + path.string());
    }
    std::ostringstream oss;
    oss << file.rdbuf();
    if (file.bad()) {
        return std::unexpected("Error reading file: " + path.string());
    }
    return oss.str();
}

auto FileServiceImpl::WriteFile(const std::filesystem::path& path, std::string_view content)
    -> std::expected<void, std::string> {
    std::ofstream file(path, std::ios::binary);
    if (!file.is_open()) {
        return std::unexpected("Failed to open file for writing: " + path.string());
    }
    file.write(content.data(), static_cast<std::streamsize>(content.size()));
    if (file.bad()) {
        return std::unexpected("Error writing to file: " + path.string());
    }
    return {};
}

bool FileServiceImpl::FileExists(const std::filesystem::path& path) const {
    return std::filesystem::exists(path);
}

}  // namespace xve
