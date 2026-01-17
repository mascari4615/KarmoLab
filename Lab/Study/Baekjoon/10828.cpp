#define _CRT_SECURE_NO_WARNINGS
#include <iostream>
#include <map>

using namespace std;

#define ENUM_PUSH 0
#define ENUM_POP 1
#define ENUM_SIZE 2
#define ENUM_EMPTY 3
#define ENUM_TOP 4

static map< string, int > m;

void Init()
{
	m["push"] = ENUM_PUSH;
	m["pop"] = ENUM_POP;
	m["size"] = ENUM_SIZE;
	m["empty"] = ENUM_EMPTY;
	m["top"] = ENUM_TOP;
}

struct Node
{
	int data;
	Node* next = NULL;
};

int main()
{
	Init();

	int n;
	cin >> n;

	Node* stack = nullptr;
	Node* top = nullptr;
	int size = 0;

	for (int i = 0; i < n; i++)
	{
		string command;
		cin >> command;

		switch (m[command])
		{
			case ENUM_PUSH:
			{
				Node* newNode = (Node*)malloc(sizeof(Node));
				cin >> newNode->data;
				if (top != nullptr)
				{
					top->next = newNode;
					top = newNode;
				}
				else
				{
					stack = newNode;
					top = newNode;
				}
				size++;
				break;
			}
			case ENUM_POP:
				if (stack)
				{
					Node* pre = stack;
					while (pre->next == top)
					{
						pre = pre->next;
					}
					cout << pre->data;
					top = pre;
					size--;
				}
				else
				{
					cout << -1;
				}
				break;
			case ENUM_SIZE:
				cout << size;
				break;
			case ENUM_EMPTY:
				cout << (size == 0 ? 1 : 0);
				break;
			case ENUM_TOP:
				cout << (top != nullptr ? top->data : -1);
				break;
			default:
				break;
		}
	}
}