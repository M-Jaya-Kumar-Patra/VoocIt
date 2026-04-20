import {
  WebSocketGateway,
  WebSocketServer,  
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || '*', // Allows your React frontend to connect
  },
})
export class SignalingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server; // Added '!' to fix the "no initializer" error

  handleConnection(client: Socket) {
    console.log(`🚀 Voocit User Connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`❌ User Disconnected: ${client.id}`);
    client.broadcast.emit('peer-disconnected'); // Tell the other person they left
  }

  @SubscribeMessage('signal')
  handleSignal(client: Socket, payload: any) {
    console.log(`Relaying signal from ${client.id}`);
    client.broadcast.emit('signal', payload);
  }

  @SubscribeMessage('chat')
  handleChat(client: Socket, payload: { text: string }) {
    // Broadcast the message to the other person in the call
    client.broadcast.emit('chat', {
      senderId: client.id,
      text: payload.text,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    });
  }

  @SubscribeMessage('get-ice-servers')
  getIceServers() {
    // In a real app, you might call the Metered API here to get temporary credentials
    return [
      { urls: 'stun:openrelay.metered.ca:80' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: '...',
        credential: '...',
      },
    ];
  }
}
