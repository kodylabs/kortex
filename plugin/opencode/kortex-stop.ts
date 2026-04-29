export const KortexPlugin = async ({ client }: any) => {
  const prompted = new Set<string>();

  return {
    event: async ({ event }: any) => {
      if (event.type === "session.idle" && !prompted.has(event.sessionID)) {
        prompted.add(event.sessionID);
        await client.session.prompt({
          path: { id: event.sessionID },
          body: {
            parts: [
              {
                type: "text",
                text: "KORTEX: Before closing, check if this session contains anything worth persisting — architecture decisions, solutions to hard problems, important project context. If yes, call save_memory with appropriate project and tags. If nothing relevant, ignore this message.",
              },
            ],
          },
        });
      }
      if (event.type === "session.deleted") {
        prompted.delete(event.sessionID);
      }
    },
  };
};
