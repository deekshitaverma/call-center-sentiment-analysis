import whisper

def transcribe_audio(audio_path):
    """
    Transcribes an audio file to text using the Whisper model.

    Args:
        audio_path (str): The file path to the audio file.

    Returns:
        str: The transcribed text.
    """
    try:
        # Load the base Whisper model. You can choose a larger model like
        # "medium" or "large" for better accuracy, but it will require more
        # computational resources.
        model = whisper.load_model("base")
        print("Transcribing audio file...")
        
        # Perform the transcription
        result = model.transcribe(audio_path)
        return result["text"]
        
    except Exception as e:
        print(f"Error during transcription: {e}")
        return None