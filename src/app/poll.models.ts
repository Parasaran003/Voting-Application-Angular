export interface Poll {
    id? : number;
    question : string;
    options : OptionVotes[];
    isActive?: boolean;       
    expiresAt?: string | null;
    isBlind?: boolean;
}

export interface OptionVotes {
    voteOption : string;
    voteCount : number;
}
