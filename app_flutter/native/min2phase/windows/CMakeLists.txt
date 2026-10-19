cmake_minimum_required(VERSION 3.16)
set(TT_M2P_TESTS OFF)
add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/.." "${CMAKE_CURRENT_BINARY_DIR}/native")
set(traintimer_min2phase_bundled_libraries
  "$<TARGET_FILE:traintimer_min2phase>"
  PARENT_SCOPE)
