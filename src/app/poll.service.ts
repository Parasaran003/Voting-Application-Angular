import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { Poll } from './poll.models';
import { Client } from '@stomp/stompjs';

@Injectable({
  providedIn: 'root',
})
export class PollService {
  private baseUrl = 'https://voting-application-backend-jvru.onrender.com/api/polls';
  
  // WebSocket setup
  private stompClient: Client | undefined;
  public pollUpdates$ = new Subject<Poll>(); // Stream for real-time updates

  constructor(private http: HttpClient) {
    this.connectToWebSocket();
  }

  // Establishes the real-time STOMP connection to Spring Boot
  private connectToWebSocket() {
    this.stompClient = new Client({
      brokerURL: 'wss://voting-application-backend-jvru.onrender.com/ws', // The live Spring Boot endpoint
      onConnect: () => {
        console.log('Connected to Real-Time Feed');
        
        // Subscribe to the broadcasting channel
        this.stompClient?.subscribe('/topic/polls', (message) => {
          const updatedPoll: Poll = JSON.parse(message.body);
          // Push the new data to the component
          this.pollUpdates$.next(updatedPoll); 
        });
      },
      onStompError: (frame) => {
        console.error('Broker reported error: ' + frame.headers['message']);
      }
    });

    this.stompClient.activate();
  }

  createPoll(poll: Poll): Observable<Poll> {
    return this.http.post<Poll>(this.baseUrl, poll);
  }

  getPolls(): Observable<Poll[]> {
    return this.http.get<Poll[]>(this.baseUrl);
  }

  // Generates and retrieves a persistent UUID for this specific browser
  getVoterId(): string {
    let voterId = localStorage.getItem('voterId');
    if (!voterId) {
      voterId = crypto.randomUUID();
      localStorage.setItem('voterId', voterId);
    }
    return voterId;
  }

  vote(pollId: number, optionIndex: number): Observable<void> {
    const url = `${this.baseUrl}/vote`;
    const payload = {
      pollId: pollId,
      optionIndex: optionIndex,
      voterId: this.getVoterId() // Attach the secure ID
    };
    return this.http.post<void>(url, payload);
  }
}