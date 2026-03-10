#!/bin/bash
# Called by udev when disks are attached/detached
# Notifies the nasOS backend API

ACTION=$1
DEVICE=$2

curl -s -X POST "http://localhost:8080/api/storage/hotplug" \
  -H "Content-Type: application/json" \
  -d "{\"action\": \"$ACTION\", \"device\": \"$DEVICE\"}" \
  2>/dev/null || true
