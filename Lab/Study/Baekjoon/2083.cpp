#include <iostream>

using namespace std;

int main()
{
	while (true)
	{
		string name;
		int age;
		int weight;

		cin >> name >> age >> weight;
		
		if (name == "#")
			break;

		bool isSeniorClass = (age > 17) || (weight >= 80);

		cout << name << ' ' << (isSeniorClass ? "Senior" : "Junior") << endl;
	}

	return 0;
}