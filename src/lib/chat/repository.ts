export interface Channel {
  slug: string;
  name: string;
  members: string[];
  description?: string;
}

export interface ChatMessage {
  id: string;
  channelSlug: string;
  fromId: string;
  fromType: "agent" | "human" | "system";
  content: string;
  replyTo?: string;
  pinned: boolean;
  createdAt: string;
}

export type UpdateChannelInput = Partial<Pick<Channel, "name" | "members" | "description">>;

export interface ChannelRepository {
  listChannels(): Promise<Channel[]>;
  getChannel(slug: string): Promise<Channel | null>;
  createChannel(channel: Channel): Promise<void>;
  updateChannel(slug: string, updates: UpdateChannelInput): Promise<Channel | null>;
  getMessages(channelSlug: string, limit?: number, before?: string): ChatMessage[];
  postMessage(
    channelSlug: string,
    fromId: string,
    fromType: ChatMessage["fromType"],
    content: string,
    replyTo?: string,
  ): ChatMessage;
  togglePin(messageId: string): boolean;
  getLatestMessageTime(channelSlug: string): string | null;
}
