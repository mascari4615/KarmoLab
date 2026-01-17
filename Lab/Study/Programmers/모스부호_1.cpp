#include <string>
#include <vector>
#include <map>
#include <sstream>

using namespace std;

string solution(string letter)
{
    map<string, string> m = 
    {
        {".-","a"},{"-...","b"},{"-.-.","c"},{"-..","d"},{".","e"},{"..-.","f"},
        {"--.","g"},{"....","h"},{"..","i"},{".---","j"},{"-.-","k"},{".-..","l"},
        {"--","m"},{"-.","n"},{"---","o"},{".--.","p"},{"--.-","q"},{".-.","r"},
        {"...","s"},{"-","t"},{"..-","u"},{"...-","v"},{".--","w"},{"-..-","x"},
        {"-.--","y"},{"--..","z"}
    };

    string answer = "";
    stringstream ss(letter);  
    string word;
    while (ss >> word)
    {
        answer += m[word];
    } 
    return answer;
}