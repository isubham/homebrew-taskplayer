CREATE TABLE asrs_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    answers JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE asrs_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own responses" ON asrs_responses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read their own responses" ON asrs_responses FOR SELECT USING (auth.uid() = user_id);
