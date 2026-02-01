#!/bin/bash
#SBATCH --job-name=wind-omni
#SBATCH --ntasks=72

# Environment setup
. /home/tshtasel/spack/share/spack/setup-env.sh
spack load openmpi
source ~/spack/opt/spack/linux-neoverse_v2/openfoam-2506-2c7fxf7kwa3wpa63autxr4bbtbxubycy/etc/bashrc

# Case directory
CASE_DIR="/home/tshtasel/of/openfoam/tutorials/incompressible/simpleFoam/windAroundBuildings"
cd "$CASE_DIR"

# Output directory for results
RESULTS_DIR="$CASE_DIR/wind_results"
mkdir -p "$RESULTS_DIR"

# Wind speed magnitude
WIND_SPEED=10

# Loop through angles: 0, 22.5, 45, ... 337.5 (16 directions)
for i in $(seq 0 15); do
    ANGLE=$(awk -v i="$i" 'BEGIN { printf "%.6f", i * 22.5 }')
    ANGLE_INT=$(printf "%.0f" "$ANGLE")  # For filename (e.g., 0, 22, 45, ...)
    
    # Calculate velocity components
    # Ux = speed * cos(angle), Uy = speed * sin(angle)
    # bc uses radians, so convert: radians = angle * pi / 180
    read UX UY <<< "$(
      awk -v i="$i" -v v="$WIND_SPEED" '
        BEGIN {
            angle = i * 22.5
            rad = angle * atan2(0,-1) / 180
            printf "%.6f %.6f", v * cos(rad), v * sin(rad)
        }'
    )"
    
    echo "=============================================="
    echo "Running angle: $ANGLE degrees"
    echo "Velocity: ($UX, $UY, 0)"
    echo "=============================================="

    echo "> Setup"
    
    # Clean previous run
    rm -rf log.*
    rm -rf processor*
    rm -rf postProcessing
    
    # Modify the Uinlet in 0/U
    sed -i "s/^Uinlet.*/Uinlet          ($UX $UY 0);/" 0.orig/U

    echo "> Simulation"
    
    # Run simulation
    ./Allrun-parallel

    echo "> Saving output..."
    
    # Copy result with angle label
    if [ -f "postProcessing/vtkWrite/windAroundBuildings_00000400/internal.vtu" ]; then
        cp "postProcessing/vtkWrite/windAroundBuildings_00000400/internal.vtu" \
           "$RESULTS_DIR/internal_${ANGLE_INT}deg.vtu"
        echo "Saved: internal_${ANGLE_INT}deg.vtu"
    else
        echo "WARNING: Output file not found for angle $ANGLE"
    fi
done
