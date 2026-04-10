#pragma once

#include <memory>

namespace xve {

class IDocumentService;
class IFileService;
class IValidationService;
class ISchemaService;
class IHelperDataService;

class ServiceContainer {
public:
    ServiceContainer();
    ~ServiceContainer();

    ServiceContainer(const ServiceContainer&) = delete;
    ServiceContainer& operator=(const ServiceContainer&) = delete;

    void Initialize();
    void Shutdown();
    bool IsInitialized() const;

    IDocumentService* GetDocumentService();
    IFileService* GetFileService();
    IValidationService* GetValidationService();
    ISchemaService* GetSchemaService();
    IHelperDataService* GetHelperDataService();

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

}  // namespace xve
