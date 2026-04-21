#include "xmlvisualeditor/services/service_container.h"

#include "xmlvisualeditor/services/document_service_impl.h"
#include "xmlvisualeditor/services/file_service_impl.h"
#include "xmlvisualeditor/services/grid_view_service_impl.h"
#include "xmlvisualeditor/services/helper_data_service_impl.h"
#include "xmlvisualeditor/services/schema_service_impl.h"
#include "xmlvisualeditor/services/validation_service_impl.h"

namespace xve {

struct ServiceContainer::Impl {
    std::unique_ptr<DocumentServiceImpl> document_service;
    std::unique_ptr<FileServiceImpl> file_service;
    std::unique_ptr<SchemaServiceImpl> schema_service;
    std::unique_ptr<ValidationServiceImpl> validation_service;
    std::unique_ptr<GridViewServiceImpl> grid_view_service;
    std::unique_ptr<HelperDataServiceImpl> helper_data_service;
    bool initialized = false;
};

ServiceContainer::ServiceContainer() : impl_(std::make_unique<Impl>()) {}

ServiceContainer::~ServiceContainer() {
    if (impl_ && impl_->initialized) {
        Shutdown();
    }
}

void ServiceContainer::Initialize() {
    impl_->document_service = std::make_unique<DocumentServiceImpl>();
    impl_->file_service = std::make_unique<FileServiceImpl>();
    impl_->schema_service = std::make_unique<SchemaServiceImpl>();
    impl_->validation_service =
        std::make_unique<ValidationServiceImpl>(impl_->document_service.get(), impl_->schema_service.get());
    impl_->grid_view_service = std::make_unique<GridViewServiceImpl>(impl_->document_service.get());
    impl_->helper_data_service =
        std::make_unique<HelperDataServiceImpl>(impl_->document_service.get(), impl_->schema_service.get());
    impl_->initialized = true;
}

void ServiceContainer::Shutdown() {
    impl_->helper_data_service.reset();
    impl_->grid_view_service.reset();
    impl_->validation_service.reset();
    impl_->schema_service.reset();
    impl_->file_service.reset();
    impl_->document_service.reset();
    impl_->initialized = false;
}

bool ServiceContainer::IsInitialized() const {
    return impl_ && impl_->initialized;
}

IDocumentService* ServiceContainer::GetDocumentService() {
    return impl_->document_service.get();
}

IFileService* ServiceContainer::GetFileService() {
    return impl_->file_service.get();
}

IValidationService* ServiceContainer::GetValidationService() {
    return impl_->validation_service.get();
}

ISchemaService* ServiceContainer::GetSchemaService() {
    return impl_->schema_service.get();
}

IHelperDataService* ServiceContainer::GetHelperDataService() {
    return impl_->helper_data_service.get();
}

IGridViewService* ServiceContainer::GetGridViewService() {
    return impl_->grid_view_service.get();
}

}  // namespace xve
