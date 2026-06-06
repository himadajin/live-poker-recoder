declare module 'pokersolver' {
  export const Hand: {
    solve(cards: string[]): {
      name: string;
      descr: string;
      rank: number;
    };
    winners<T>(hands: T[]): T[];
  };
}
