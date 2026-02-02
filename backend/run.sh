#!/bin/bash
# Quick start script for Monaco backend

echo "Starting Monaco Monte Carlo Simulation Backend..."
echo "API will be available at http://localhost:8000"
echo "Interactive docs at http://localhost:8000/docs"
echo ""

cd "$(dirname "$0")"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Creating one..."
    python3 -m venv venv
    source venv/bin/activate
    echo "Installing dependencies..."
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Run the server
python main.py
