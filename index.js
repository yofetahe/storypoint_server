const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require("socket.io");

const app = express();

app.use(cors());

app.get('/', (req, res) => {
    res.status(200).send("The Server is running").end();
})

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: 'https://mypokerboard.azurewebsites.net',// where the view is running
        methods: ['GET', 'POST']
    }
});

const rooms = []

io.on('connection', (socket) => {
    socket.on("create_room", ({ roomDetail, username }) => {
        // Join room
        socket.join(roomDetail.id);
        // Update server-side data
        rooms.push(roomDetail);
        // Response to client
        io.to(roomDetail.id).emit("created_room", { room: roomDetail, username });
        // Validation message
        console.log(`User with ID: ${socket.id} created room: ${roomDetail.id}`);
    });

    socket.on("join_room", ({ roomId, userData }) => {
        if (io.sockets.adapter.rooms.has(roomId)) {
            // Join room
            socket.join(roomId);
            // Update server-side data
            let roomData
            rooms.forEach(room => {
                if (room.id === roomId) {
                    room.attendees.push(userData);
                    roomData = room;
                }
            });
            // Response to client
            io.to(roomId).emit("joined_attendee", { room: roomData, userId: userData.id });
            socket.emit("join_info", { username: userData.name, userId: userData.id });
            // Validation message
            console.log(`User with ID: ${userData.id} joined room: ${roomId}`);
        } else {
            socket.emit("message", "Sorry, the room you tried to join is closed.");
        }
    });

    socket.on("leave_room", ({ roomId, username, userId }) => {
        // Update server-side data
        let roomData;
        rooms.forEach(room => {
            if (room.id === roomId) {
                let indx = room.attendees.findIndex(attendee => attendee.id === userId);
                if (indx > -1) {
                    room.attendees.splice(indx, 1);
                }
                roomData = room;
            }
        });
        // Response to client
        io.to(roomId).emit("exit_room", roomData);
    })

    socket.on("send_point", ({ roomId, username, point }) => {
        let roomData;
        rooms.forEach(room => {
            if (room.id === roomId) {
                room.attendees.forEach(attendee => {
                    if (attendee.name === username) {
                        attendee.point = point;
                    }
                });
                roomData = room;
            }
        })
        io.to(roomId).emit("set_point", roomData);
    });

    socket.on("reset_board", (roomId) => {
        let roomData;
        rooms.forEach(room => {
            if (room.id === roomId) {
                room.attendees.forEach(attendee => {
                    attendee.point = null;
                });
                room.avgResult = 0.0;
                room.viewPoint = false;
                roomData = room;
            }
        })
        io.to(roomId).emit("new_board", roomData);
    });

    socket.on("view_story_point", (roomId) => {
        let roomData;
        let pointCount
        rooms.forEach(room => {
            if (room.id === roomId) {
                // Set flag to view points
                room.viewPoint = true;

                room.avgResult = calculateAvergae(room);

                roomData = room;
                pointCount = countPerPoint(room)
            }
        });
        io.to(roomId).emit("view_result", { roomData, pointCount });
    });

    socket.on("close_room", (roomId) => {
        io.to(roomId).emit("message", "Room disconnected by creator!");
        socket.disconnect(roomId);
        io.socketsLeave(roomId);

        let indx
        rooms.filter((room, index) => {
            if (room.id === roomId) {
                indx = index;
            }
        });
        rooms.splice(indx, 1);
    })

    socket.on('disconnecting', (reason) => {
        let roomData;
        let roomId;
        rooms.filter(room => {
            let i
            room.attendees.forEach((attendee, index) => {
                if (attendee.userId === socket.id) {
                    roomId = room.id;
                    i = index;
                }
            });
            if (i > -1) {
                room.attendees.splice(i, 1);
                roomData = room;
            }
        });
        io.to(roomId).emit("attendee_disconnected", roomData);
        console.log("User disconnected", socket.id);
    });
});

const port = process.env.PORT || 3001;

server.listen(port, () => {
    console.log(`server running on port ${port}`);
});

function getRandomCharacter() {
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const chaactersLength = characters.length;
    let result = ""

    for (var i = 0; i < 5; i++) {
        result += characters.charAt(Math.floor(Math.random() * chaactersLength));
    }

    return result;
}

function calculateAvergae(room) {
    let sum = 0, counter = 0;
    room.attendees.forEach(attend => {
        if (attend.point) {
            sum += Number(attend.point);
            counter++;
        }
    });
    let avg = 0.0;
    if (counter > 0) {
        avg = sum / counter;
    }

    return avg.toFixed(1);
}

function countPerPoint(room) {
    let result = {}
    room.attendees.forEach(attend => {
        if (attend.point) {
            if (result.hasOwnProperty(attend.point.toString())) {
                result[attend.point.toString()] += 1;
            } else {
                result[attend.point.toString()] = 1;
            }
        }
    });
    return result;
}