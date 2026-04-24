#!/bin/bash

tmux new-session -d -s Mekkify
tmux send -t Mekkify 'node main.js' ENTER
