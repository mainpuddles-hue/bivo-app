-- Server-side text length constraints (defense in depth — client already enforces)
ALTER TABLE post_comments ADD CONSTRAINT post_comments_content_length CHECK (char_length(content) <= 1000);
ALTER TABLE messages ADD CONSTRAINT messages_content_length CHECK (char_length(content) <= 5000);
ALTER TABLE posts ADD CONSTRAINT posts_title_length CHECK (char_length(title) <= 300);
ALTER TABLE posts ADD CONSTRAINT posts_description_length CHECK (char_length(description) <= 10000);
