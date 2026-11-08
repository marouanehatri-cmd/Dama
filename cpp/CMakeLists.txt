# CMake configuration for Dama Master C++ Bitboard Engine
cmake_minimum_required(VERSION 3.22.1)

project(dama_engine VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Optimization flags for ARM64 and x86_64
if(CMAKE_BUILD_TYPE STREQUAL "Release" OR NOT CMAKE_BUILD_TYPE)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -flto -fvisibility=hidden -funroll-loops -DNDEBUG")
endif()

add_library(dama_engine SHARED
    engine.cpp
)

target_include_directories(dama_engine PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
)

find_library(log-lib log)

target_link_libraries(dama_engine PRIVATE
    ${log-lib}
)
