#include <iostream>

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: xve-validate <file.xml> [--schema <file.xsd>]" << std::endl;
        return 1;
    }
    std::cout << "xve-validate — not yet implemented" << std::endl;
    return 0;
}
