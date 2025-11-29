# maps/export.py
"""
프로젝트를 TXT 포맷(node.txt, link.txt, arrow.txt, polygon.txt, core.txt)으로
내보내기(export) 하기 위한 모듈.

- 현재는 골격만 있고, 실제 로직은 아직 구현되지 않은 상태.
- 나중에 요구사항에 맞춰 프로젝트 데이터를 가공해서
  여러 개의 텍스트 파일을 만들고, zip으로 묶어 반환하도록 구현하면 된다.
"""


def export_project_to_txt(project: dict):
    """
    주어진 프로젝트(dict)를 TXT 파일 포맷들로 변환하는 함수 (미구현).

    파라미터
    --------
    project : dict
        DB에 저장된 Project.data (이미 JSON → dict로 로드된 상태)

    예상 동작 (TODO)
    ---------------
    1) project 안의 nodes / connections / polygons / north_reference 등을 읽는다.
    2) 각각을 요구 포맷에 맞게 문자열로 변환:
       - node.txt
       - link.txt
       - arrow.txt
       - polygon.txt
       - core.txt
    3) 텍스트 파일 5개를 zip에 담아서 반환하거나,
       Django HttpResponse로 넘길 수 있는 형태(bytes 등)로 만들어준다.

    현재는 아직 스펙이 확정되지 않았으므로 NotImplementedError만 발생시킨다.
    """
    raise NotImplementedError("export_project_to_txt() is not implemented yet.")
