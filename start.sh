#!/bin/bash
cd ~/Documents/repos/setlist
exec python3 -m uvicorn main:app --port 4445
