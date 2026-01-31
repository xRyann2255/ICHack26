#!/usr/bin/env python3
"""
Test client for the WebSocket server.

Usage:
    # In terminal 1: Start the server
    python -m backend.server.websocket_server --port 8765

    # In terminal 2: Run this test client
    python -m backend.server.test_client
"""

import asyncio
import json

try:
    import websockets
except ImportError:
    print("Please install websockets: pip install websockets")
    exit(1)


async def test_client():
    """Test the WebSocket server."""
    uri = "ws://localhost:8765"

    print(f"Connecting to {uri}...")

    async with websockets.connect(uri) as websocket:
        print("Connected!")

        # Get scene info
        print("\n=== Getting scene info ===")
        await websocket.send(json.dumps({"type": "get_scene"}))
        response = await websocket.recv()
        scene = json.loads(response)
        print(f"Scene type: {scene['type']}")
        print(f"Buildings: {len(scene['data']['buildings'])}")
        print(f"Bounds: {scene['data']['bounds']}")

        # Start simulation
        # Coordinates are [x, y_altitude, z_depth] with Y-up system
        # Bounds are (200, 80, 200) so altitude (y) must be 0-80
        print("\n=== Starting simulation ===")
        await websocket.send(json.dumps({
            "type": "start",
            "start": [180, 40, 100],  # x=180, altitude=40, z=100
            "end": [20, 40, 100],      # x=20, altitude=40, z=100
            "route_type": "both"
        }))

        # Receive messages
        frame_count = {"naive": 0, "optimized": 0}

        while True:
            response = await websocket.recv()
            data = json.loads(response)
            msg_type = data.get("type")

            if msg_type == "paths":
                print(f"\nPaths received:")
                for route, path in data["data"].items():
                    print(f"  {route}: {len(path)} waypoints")

            elif msg_type == "simulation_start":
                print(f"\nStarting {data['route']} simulation ({data['waypoint_count']} waypoints)")

            elif msg_type == "frame":
                route = data["route"]
                frame_count[route] += 1
                frame = data["data"]

                # Print every 10th frame
                if frame_count[route] % 10 == 1:
                    print(f"  [{route}] t={frame['time']:.1f}s pos={frame['position'][:2]} effort={frame['effort']:.2f}")

            elif msg_type == "simulation_end":
                route = data["route"]
                summary = data["flight_summary"]
                print(f"\n{route.upper()} complete:")
                print(f"  Time: {summary['total_time']:.1f}s")
                print(f"  Distance: {summary['total_distance']:.1f}m")
                print(f"  Avg effort: {summary['average_effort']:.3f}")
                print(f"  Frames: {frame_count[route]}")

            elif msg_type == "complete":
                print("\n=== All simulations complete ===")
                break

            elif msg_type == "error":
                print(f"ERROR: {data['message']}")
                break

        print("\nTest complete!")


if __name__ == "__main__":
    asyncio.run(test_client())
