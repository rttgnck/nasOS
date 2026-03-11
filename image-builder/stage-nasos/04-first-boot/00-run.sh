#!/bin/bash -e
mkdir -p "${ROOTFS_DIR}/files"
cp -a files/* "${ROOTFS_DIR}/files/"
