from flask import Flask, request, jsonify
from transcriber import transcribe_audio
from sentiment_analyzer import analyze_sentiment
import os
from tempfile import NamedTemporaryFile
from flask_cors import CORS # Used to handle Cross-Origin Resource Sharing

app = Flask(__name__)
# Allow requests from your React app. This is important for development.
CORS(app) 

@app.route('/analyze', methods=['POST'])
def analyze():
    """
    API endpoint to receive an audio file, transcribe it, and analyze its sentiment.
    """
    # Check if an audio file was included in the request
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400

    audio_file = request.files['audio']

    # We need to save the audio file temporarily to a location that the
    # Whisper library can access.
    try:
        with NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
            audio_file.save(temp_file.name)
            temp_file_path = temp_file.name
        
        # Step 1: Transcribe the temporary audio file
        transcribed_text = transcribe_audio(temp_file_path)

        # Handle transcription errors
        if not transcribed_text:
            return jsonify({'error': 'Failed to transcribe audio'}), 500

        # Step 2: Analyze the sentiment of the transcribed text
        sentiment_result = analyze_sentiment(transcribed_text)
        
        # Handle sentiment analysis errors
        if not sentiment_result:
            return jsonify({'error': 'Failed to analyze sentiment'}), 500

        # Return a JSON response with the results
        return jsonify({
            'transcribed_text': transcribed_text,
            'sentiment': sentiment_result
        })

    except Exception as e:
        # Catch any unexpected errors and return a server error message
        return jsonify({'error': str(e)}), 500
    finally:
        # Clean up the temporary file, ensuring it's always deleted
        if 'temp_file_path' in locals() and os.path.exists(temp_file_path):
            os.remove(temp_file_path)

if __name__ == '__main__':
    app.run(debug=True)

