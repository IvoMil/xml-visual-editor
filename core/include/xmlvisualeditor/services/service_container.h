#pragma once

#include <memory>

namespace xve {

class IDocumentService;
class IFileService;
class IGridViewService;
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
    IGridViewService* GetGridViewService();

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

}  // namespace xve
