import os
from transcriber import transcribe_audio
from sentiment_analyzer import analyze_sentiment

def main():
    """
    Main function to run the sentiment analysis project.
    It transcribes a call and then analyzes its sentiment.
    """
    print("Starting the call sentiment analysis project...")
    
    # Get the absolute path of the current script's directory
    base_dir = os.path.dirname(os.path.abspath(__file__))

    # Define the path to the audio file using the absolute path
    audio_file_path = os.path.join(base_dir, "audio", "test_call.wav")
    
    # Let's add a quick check to see if the file exists before we proceed
    if not os.path.exists(audio_file_path):
        print(f"Error: Audio file not found at '{audio_file_path}'")
        return
        
    # Step 1: Transcribe the audio file
    transcribed_text = transcribe_audio(audio_file_path)
    
    if transcribed_text:
        print(f"\n--- Transcribed Text ---")
        print(transcribed_text)
        
        # Step 2: Analyze the sentiment of the transcribed text
        sentiment_result = analyze_sentiment(transcribed_text)
        
        if sentiment_result:
            print(f"\n--- Sentiment Analysis Result ---")
            print(f"Label: {sentiment_result['label']}")
            print(f"Score: {sentiment_result['score']:.4f}")
        else:
            print("Could not perform sentiment analysis.")
    else:
        print("Could not transcribe the audio file.")

if __name__ == "__main__":
    main()

