import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { PollService } from '../poll.service';
import { Poll } from '../poll.models';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-poll',
  imports: [CommonModule, FormsModule],
  templateUrl: './poll.component.html',
  styleUrl: './poll.component.css',
})
export class PollComponent implements OnInit {
  polls: Poll[] = [];
  isLoading: boolean = true;
  successMessage: string = '';

  // Search and Sort State
  searchQuery: string = '';
  sortBy: string = 'newest';

  // Double voting prevention state
  votedPolls: Set<number> = new Set<number>();
  
  // State for the dropdown in the UI (default 24 hours)
  pollDuration: number = 24;

  newPoll: Poll = {
    question: '',
    isActive: true, 
    expiresAt: null,
    isBlind: false, 
    options: [
      { voteOption: '', voteCount: 0 },
      { voteOption: '', voteCount: 0 },
    ]
  };

  constructor(private pollService: PollService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadVotedPolls(); // Load voting history first
    this.loadPolls();

    // Listen for real-time WebSocket updates
    this.pollService.pollUpdates$.subscribe({
      next: (updatedPoll) => {
        // Safety check for optional IDs
        if (updatedPoll.id === undefined) return;
        
        const index = this.polls.findIndex(p => p.id === updatedPoll.id);
        
        if (index !== -1) {
          // If the poll exists, replace it with the fresh data (vote increment)
          this.polls[index] = updatedPoll;
        } else {
          // If it's a brand new poll, add it to the top of the feed
          this.polls.unshift(updatedPoll);
        }
        
        // Redraw the screen immediately with the new data
        this.cdr.detectChanges(); 
      }
    });
  }

  // Load the user's vote history from local storage
  loadVotedPolls() {
    const saved = localStorage.getItem('votedPolls');
    if (saved) {
      this.votedPolls = new Set(JSON.parse(saved));
    }
  }

  // Helper method for the HTML template to check if a poll is locked
  hasVoted(pollId: number | undefined): boolean {
    if (pollId === undefined) return false;
    return this.votedPolls.has(pollId);
  }

  // Helper method to determine if a poll is visually locked by expiration
  isPollClosed(poll: Poll): boolean {
    if (poll.isActive === false) return true;
    if (poll.expiresAt) {
      const expirationTime = new Date(poll.expiresAt).getTime();
      const currentTime = new Date().getTime();
      return currentTime > expirationTime;
    }
    return false;
  }

  loadPolls() {
    this.isLoading = true; 
    
    this.pollService.getPolls().subscribe({
      next: (data) => {
        this.polls = data || []; 
        this.isLoading = false; 
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error("Error in fetching polls: ", error);
        this.polls = []; 
        this.isLoading = false; 
        this.cdr.detectChanges();
      }
    });
  }

  get filteredPolls(): Poll[] {
    let result = [...this.polls];

    // 1. Filter by search query (matches question or option text)
    if (this.searchQuery && this.searchQuery.trim() !== '') {
      const query = this.searchQuery.toLowerCase().trim();
      result = result.filter(poll => 
        poll.question.toLowerCase().includes(query) ||
        poll.options.some(opt => opt.voteOption.toLowerCase().includes(query))
      );
    }

    // 2. Sort results
    result.sort((a, b) => {
      const idA = a.id || 0;
      const idB = b.id || 0;

      if (this.sortBy === 'newest') {
        return idB - idA;
      } else if (this.sortBy === 'oldest') {
        return idA - idB;
      } else if (this.sortBy === 'most-voted') {
        const totalVotesA = a.options.reduce((sum, opt) => sum + opt.voteCount, 0);
        const totalVotesB = b.options.reduce((sum, opt) => sum + opt.voteCount, 0);
        return totalVotesB - totalVotesA;
      }
      return 0;
    });

    return result;
  }

  addOption() {
    this.newPoll.options.push({ voteOption: '', voteCount: 0 });
  }

  removeOption(index: number) {
    if (this.newPoll.options.length > 2) {
      this.newPoll.options.splice(index, 1);
    }
  }

  resetPoll() {
    this.newPoll = {
      // REMOVED id: 0
      question: '',
      isActive: true,
      expiresAt: null,
      isBlind: false,
      options: [
        { voteOption: '', voteCount: 0 },
        { voteOption: '', voteCount: 0 },
      ]
    };
    this.pollDuration = 24; // reset dropdown
  }

  createPoll() {
    // If duration is greater than 0, calculate the exact expiration time
    if (this.pollDuration > 0) {
      const expirationDate = new Date();
      expirationDate.setHours(expirationDate.getHours() + Number(this.pollDuration));
      this.newPoll.expiresAt = expirationDate.toISOString(); 
    } else {
      // 0 means "Never Expires"
      this.newPoll.expiresAt = null; 
    }

    this.pollService.createPoll(this.newPoll).subscribe({
      next: () => {
        this.resetPoll();
        
        this.successMessage = 'Poll successfully launched and added to the live feed!';
        this.cdr.detectChanges();

        setTimeout(() => {
          this.successMessage = '';
          this.cdr.detectChanges();
        }, 4000);
      },
      error: (error) => {
        console.error("Error creating poll: ", error);
      }
    });
  }

  vote(pollId: number | undefined, optionIndex: number) {
    if (pollId === undefined) return;

    // 1. INSTANT LOCK: Check if they already voted
    if (this.hasVoted(pollId)) {
      return; 
    }

    // 2. Lock the UI immediately before the network request even starts
    this.votedPolls.add(pollId);
    localStorage.setItem('votedPolls', JSON.stringify(Array.from(this.votedPolls)));
    this.cdr.detectChanges(); // Force the HTML to update instantly

    // 3. Now send the request to the backend safely
    this.pollService.vote(pollId, optionIndex).subscribe({
      next: () => {
        // Success! We don't need to do anything else because the UI is already locked.
      },
      error: (error) => {
        console.error("Error voting on a poll: ", error);
        
        // Optional: If the server crashes for a reason other than a duplicate vote, 
        // you could unlock the UI here by removing the ID from the Set.
      }
    });
  }

  // Calculates the percentage of votes for a specific option
  getOptionPercentage(poll: Poll, voteCount: number): number {
    const totalVotes = poll.options.reduce((sum, opt) => sum + opt.voteCount, 0);
    if (totalVotes === 0) return 0; // Prevent dividing by zero
    return Math.round((voteCount / totalVotes) * 100);
  }
}